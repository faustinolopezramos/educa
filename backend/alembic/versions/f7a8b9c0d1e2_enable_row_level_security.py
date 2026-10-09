"""enable row level security (RLS) and multi-tenant isolation policies

Revision ID: f7a8b9c0d1e2
Revises: e4f5a6b7c8d9
Create Date: 2026-10-08 19:30:00.000000
"""

from typing import Sequence, Union

from alembic import op

revision: str = "f7a8b9c0d1e2"
down_revision: Union[str, None] = "e4f5a6b7c8d9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Todas las tablas del esquema público de EDUCA
ALL_TABLES: list[str] = [
    "tenants",
    "users",
    "languages",
    "nationalities",
    "levels",
    "rooms",
    "courses",
    "course_teachers",
    "schedules",
    "enrollments",
    "class_sessions",
    "attendance",
    "grades",
    "course_evaluations",
    "academic_holidays",
    "location_proposals",
    "teacher_availabilities",
    "teacher_languages",
    "teacher_rates",
    "payments",
    "invoices",
    "document_counters",
    "meeting_providers",
    "virtual_meetings",
    "meeting_logs",
    "audit_log",
    "at_risk_sweeps",
    "push_subscriptions",
    "notifications",
    "notification_deliveries",
    "assignments",
    "assignment_submissions",
    "refresh_sessions",
    "make_up_credits",
    "renewal_requests",
]

# Tablas con columna `tenant_id` directa
TENANT_SCOPED_TABLES: list[str] = [
    "courses",
    "rooms",
    "academic_holidays",
    "assignments",
    "assignment_submissions",
    "meeting_providers",
    "audit_log",
    "at_risk_sweeps",
    "make_up_credits",
    "teacher_rates",
]

# Tablas hijas que se aíslan a través de `course_id`
COURSE_SCOPED_TABLES: list[str] = [
    "course_teachers",
    "schedules",
    "course_evaluations",
]


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    # 1. Esquema y función de contingencia para auth.uid() en Postgres local/CI si Supabase no está presente
    op.execute(
        """
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid 
            WHERE n.nspname = 'auth' AND p.proname = 'uid'
          ) THEN
            CREATE SCHEMA IF NOT EXISTS auth;
            CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT NULL::uuid';
          END IF;
        END $$;
        """
    )

    # 2. Funciones auxiliares de RLS en el esquema public
    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.current_tenant_id()
        RETURNS integer
        LANGUAGE plpgsql
        STABLE
        AS $$
        DECLARE
          v_tenant_id text;
          v_uid uuid;
        BEGIN
          -- Contexto de sesión fijado por la API (SET LOCAL app.current_tenant_id)
          v_tenant_id := current_setting('app.current_tenant_id', true);
          IF v_tenant_id IS NOT NULL AND v_tenant_id <> '' THEN
            RETURN v_tenant_id::integer;
          END IF;

          -- Token de Supabase Auth (auth.uid())
          BEGIN
            v_uid := auth.uid();
          EXCEPTION WHEN OTHERS THEN
            v_uid := NULL;
          END;

          IF v_uid IS NOT NULL THEN
            RETURN (SELECT tenant_id FROM public.users WHERE supabase_uid = v_uid::text LIMIT 1);
          END IF;

          RETURN NULL;
        END;
        $$;
        """
    )

    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.is_superadmin()
        RETURNS boolean
        LANGUAGE plpgsql
        STABLE
        AS $$
        DECLARE
          v_is_super text;
          v_uid uuid;
        BEGIN
          v_is_super := current_setting('app.is_superadmin', true);
          IF v_is_super = 'true' THEN
            RETURN true;
          END IF;

          BEGIN
            v_uid := auth.uid();
          EXCEPTION WHEN OTHERS THEN
            v_uid := NULL;
          END;

          IF v_uid IS NOT NULL THEN
            RETURN EXISTS (
              SELECT 1 FROM public.users 
              WHERE supabase_uid = v_uid::text AND role = 'superadmin'
            );
          END IF;

          RETURN false;
        END;
        $$;
        """
    )

    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.current_user_id()
        RETURNS integer
        LANGUAGE plpgsql
        STABLE
        AS $$
        DECLARE
          v_user_id text;
          v_uid uuid;
        BEGIN
          v_user_id := current_setting('app.current_user_id', true);
          IF v_user_id IS NOT NULL AND v_user_id <> '' THEN
            RETURN v_user_id::integer;
          END IF;

          BEGIN
            v_uid := auth.uid();
          EXCEPTION WHEN OTHERS THEN
            v_uid := NULL;
          END;

          IF v_uid IS NOT NULL THEN
            RETURN (SELECT id FROM public.users WHERE supabase_uid = v_uid::text LIMIT 1);
          END IF;

          RETURN NULL;
        END;
        $$;
        """
    )

    # 3. Activar RLS en todas las tablas
    for tbl in ALL_TABLES:
        op.execute(f"ALTER TABLE public.{tbl} ENABLE ROW LEVEL SECURITY;")

    # 4. Políticas de tablas de referencia global
    op.execute(
        """
        DROP POLICY IF EXISTS nationalities_select_policy ON public.nationalities;
        CREATE POLICY nationalities_select_policy ON public.nationalities
          FOR SELECT TO PUBLIC USING (true);

        DROP POLICY IF EXISTS levels_select_policy ON public.levels;
        CREATE POLICY levels_select_policy ON public.levels
          FOR SELECT TO PUBLIC USING (true);
        """
    )

    # 5. Políticas de Tenants
    op.execute(
        """
        DROP POLICY IF EXISTS tenants_select_policy ON public.tenants;
        CREATE POLICY tenants_select_policy ON public.tenants
          FOR SELECT TO PUBLIC
          USING (is_active = true OR id = public.current_tenant_id() OR public.is_superadmin());

        DROP POLICY IF EXISTS tenants_insert_policy ON public.tenants;
        CREATE POLICY tenants_insert_policy ON public.tenants
          FOR INSERT TO PUBLIC WITH CHECK (public.is_superadmin());

        DROP POLICY IF EXISTS tenants_update_policy ON public.tenants;
        CREATE POLICY tenants_update_policy ON public.tenants
          FOR UPDATE TO PUBLIC
          USING (id = public.current_tenant_id() OR public.is_superadmin())
          WITH CHECK (id = public.current_tenant_id() OR public.is_superadmin());
        """
    )

    # 6. Políticas de tablas con tenant_id directo
    for tbl in TENANT_SCOPED_TABLES:
        op.execute(
            f"""
            DROP POLICY IF EXISTS {tbl}_tenant_isolation ON public.{tbl};
            CREATE POLICY {tbl}_tenant_isolation ON public.{tbl}
              FOR ALL TO PUBLIC
              USING (tenant_id = public.current_tenant_id() OR public.is_superadmin())
              WITH CHECK (tenant_id = public.current_tenant_id() OR public.is_superadmin());
            """
        )

    # 7. Políticas de Idiomas (languages: global si tenant_id IS NULL)
    op.execute(
        """
        DROP POLICY IF EXISTS languages_select_policy ON public.languages;
        CREATE POLICY languages_select_policy ON public.languages
          FOR SELECT TO PUBLIC
          USING (tenant_id = public.current_tenant_id() OR tenant_id IS NULL OR public.is_superadmin());

        DROP POLICY IF EXISTS languages_write_policy ON public.languages;
        CREATE POLICY languages_write_policy ON public.languages
          FOR ALL TO PUBLIC
          USING (tenant_id = public.current_tenant_id() OR public.is_superadmin())
          WITH CHECK (tenant_id = public.current_tenant_id() OR public.is_superadmin());
        """
    )

    # 8. Contadores documentales (document_counters: global si tenant_key = 0)
    op.execute(
        """
        DROP POLICY IF EXISTS document_counters_isolation ON public.document_counters;
        CREATE POLICY document_counters_isolation ON public.document_counters
          FOR ALL TO PUBLIC
          USING (tenant_key = public.current_tenant_id() OR tenant_key = 0 OR public.is_superadmin())
          WITH CHECK (tenant_key = public.current_tenant_id() OR tenant_key = 0 OR public.is_superadmin());
        """
    )

    # 9. Políticas de Usuarios
    op.execute(
        """
        DROP POLICY IF EXISTS users_select_policy ON public.users;
        CREATE POLICY users_select_policy ON public.users
          FOR SELECT TO PUBLIC
          USING (
            (public.current_tenant_id() IS NOT NULL AND tenant_id = public.current_tenant_id()) 
            OR (public.current_user_id() IS NOT NULL AND id = public.current_user_id()) 
            OR public.is_superadmin()
          );

        DROP POLICY IF EXISTS users_insert_policy ON public.users;
        CREATE POLICY users_insert_policy ON public.users
          FOR INSERT TO PUBLIC
          WITH CHECK (
            (public.current_tenant_id() IS NOT NULL AND tenant_id = public.current_tenant_id()) 
            OR public.is_superadmin()
          );

        DROP POLICY IF EXISTS users_update_policy ON public.users;
        CREATE POLICY users_update_policy ON public.users
          FOR UPDATE TO PUBLIC
          USING (
            (public.current_tenant_id() IS NOT NULL AND tenant_id = public.current_tenant_id()) 
            OR (public.current_user_id() IS NOT NULL AND id = public.current_user_id()) 
            OR public.is_superadmin()
          )
          WITH CHECK (
            (public.current_tenant_id() IS NOT NULL AND tenant_id = public.current_tenant_id()) 
            OR (public.current_user_id() IS NOT NULL AND id = public.current_user_id()) 
            OR public.is_superadmin()
          );

        DROP POLICY IF EXISTS users_delete_policy ON public.users;
        CREATE POLICY users_delete_policy ON public.users
          FOR DELETE TO PUBLIC
          USING (
            (public.current_tenant_id() IS NOT NULL AND tenant_id = public.current_tenant_id()) 
            OR public.is_superadmin()
          );
        """
    )

    # 10. Políticas de tablas aisladas por course_id
    for tbl in COURSE_SCOPED_TABLES:
        op.execute(
            f"""
            DROP POLICY IF EXISTS {tbl}_course_isolation ON public.{tbl};
            CREATE POLICY {tbl}_course_isolation ON public.{tbl}
              FOR ALL TO PUBLIC
              USING (
                course_id IN (SELECT id FROM public.courses WHERE tenant_id = public.current_tenant_id() OR public.is_superadmin())
              )
              WITH CHECK (
                course_id IN (SELECT id FROM public.courses WHERE tenant_id = public.current_tenant_id() OR public.is_superadmin())
              );
            """
        )

    # 10b. Sesiones de clase (class_sessions: aisladas por schedule -> course)
    op.execute(
        """
        DROP POLICY IF EXISTS class_sessions_isolation ON public.class_sessions;
        CREATE POLICY class_sessions_isolation ON public.class_sessions
          FOR ALL TO PUBLIC
          USING (
            schedule_id IN (
              SELECT id FROM public.schedules 
              WHERE course_id IN (SELECT id FROM public.courses WHERE tenant_id = public.current_tenant_id() OR public.is_superadmin())
            )
          )
          WITH CHECK (
            schedule_id IN (
              SELECT id FROM public.schedules 
              WHERE course_id IN (SELECT id FROM public.courses WHERE tenant_id = public.current_tenant_id() OR public.is_superadmin())
            )
          );
        """
    )

    # 11. Matriculaciones (enrollments)
    op.execute(
        """
        DROP POLICY IF EXISTS enrollments_isolation ON public.enrollments;
        CREATE POLICY enrollments_isolation ON public.enrollments
          FOR ALL TO PUBLIC
          USING (
            course_id IN (SELECT id FROM public.courses WHERE tenant_id = public.current_tenant_id() OR public.is_superadmin())
            OR student_id = public.current_user_id()
          )
          WITH CHECK (
            course_id IN (SELECT id FROM public.courses WHERE tenant_id = public.current_tenant_id() OR public.is_superadmin())
          );
        """
    )

    # 12. Asistencias, Calificaciones, Pagos y Facturas
    op.execute(
        """
        DROP POLICY IF EXISTS attendance_isolation ON public.attendance;
        CREATE POLICY attendance_isolation ON public.attendance
          FOR ALL TO PUBLIC
          USING (
            enrollment_id IN (
              SELECT id FROM public.enrollments 
              WHERE course_id IN (SELECT id FROM public.courses WHERE tenant_id = public.current_tenant_id() OR public.is_superadmin())
              OR student_id = public.current_user_id()
            )
          )
          WITH CHECK (
            enrollment_id IN (
              SELECT id FROM public.enrollments 
              WHERE course_id IN (SELECT id FROM public.courses WHERE tenant_id = public.current_tenant_id() OR public.is_superadmin())
            )
          );

        DROP POLICY IF EXISTS grades_isolation ON public.grades;
        CREATE POLICY grades_isolation ON public.grades
          FOR ALL TO PUBLIC
          USING (
            enrollment_id IN (
              SELECT id FROM public.enrollments 
              WHERE course_id IN (SELECT id FROM public.courses WHERE tenant_id = public.current_tenant_id() OR public.is_superadmin())
              OR student_id = public.current_user_id()
            )
          )
          WITH CHECK (
            enrollment_id IN (
              SELECT id FROM public.enrollments 
              WHERE course_id IN (SELECT id FROM public.courses WHERE tenant_id = public.current_tenant_id() OR public.is_superadmin())
            )
          );

        DROP POLICY IF EXISTS payments_isolation ON public.payments;
        CREATE POLICY payments_isolation ON public.payments
          FOR ALL TO PUBLIC
          USING (
            enrollment_id IN (
              SELECT id FROM public.enrollments 
              WHERE course_id IN (SELECT id FROM public.courses WHERE tenant_id = public.current_tenant_id() OR public.is_superadmin())
              OR student_id = public.current_user_id()
            )
          )
          WITH CHECK (
            enrollment_id IN (
              SELECT id FROM public.enrollments 
              WHERE course_id IN (SELECT id FROM public.courses WHERE tenant_id = public.current_tenant_id() OR public.is_superadmin())
            )
          );

        DROP POLICY IF EXISTS invoices_isolation ON public.invoices;
        CREATE POLICY invoices_isolation ON public.invoices
          FOR ALL TO PUBLIC
          USING (
            enrollment_id IN (
              SELECT id FROM public.enrollments 
              WHERE course_id IN (SELECT id FROM public.courses WHERE tenant_id = public.current_tenant_id() OR public.is_superadmin())
              OR student_id = public.current_user_id()
            )
          )
          WITH CHECK (
            enrollment_id IN (
              SELECT id FROM public.enrollments 
              WHERE course_id IN (SELECT id FROM public.courses WHERE tenant_id = public.current_tenant_id() OR public.is_superadmin())
            )
          );

        DROP POLICY IF EXISTS renewal_requests_isolation ON public.renewal_requests;
        CREATE POLICY renewal_requests_isolation ON public.renewal_requests
          FOR ALL TO PUBLIC
          USING (
            course_id IN (SELECT id FROM public.courses WHERE tenant_id = public.current_tenant_id() OR public.is_superadmin())
            OR student_id = public.current_user_id()
          )
          WITH CHECK (
            course_id IN (SELECT id FROM public.courses WHERE tenant_id = public.current_tenant_id() OR public.is_superadmin())
            OR student_id = public.current_user_id()
          );
        """
    )

    # 13. Notificaciones, suscripciones push y sesiones de actualización
    op.execute(
        """
        DROP POLICY IF EXISTS notifications_isolation ON public.notifications;
        CREATE POLICY notifications_isolation ON public.notifications
          FOR ALL TO PUBLIC
          USING (
            recipient_id = public.current_user_id()
            OR recipient_id IN (SELECT id FROM public.users WHERE tenant_id = public.current_tenant_id() OR public.is_superadmin())
          )
          WITH CHECK (
            recipient_id IN (SELECT id FROM public.users WHERE tenant_id = public.current_tenant_id() OR public.is_superadmin())
          );

        DROP POLICY IF EXISTS notification_deliveries_isolation ON public.notification_deliveries;
        CREATE POLICY notification_deliveries_isolation ON public.notification_deliveries
          FOR ALL TO PUBLIC
          USING (
            notification_id IN (
              SELECT id FROM public.notifications 
              WHERE recipient_id = public.current_user_id() 
              OR recipient_id IN (SELECT id FROM public.users WHERE tenant_id = public.current_tenant_id() OR public.is_superadmin())
            )
          )
          WITH CHECK (
            notification_id IN (
              SELECT id FROM public.notifications 
              WHERE recipient_id = public.current_user_id() 
              OR recipient_id IN (SELECT id FROM public.users WHERE tenant_id = public.current_tenant_id() OR public.is_superadmin())
            )
          );

        DROP POLICY IF EXISTS push_subscriptions_isolation ON public.push_subscriptions;
        CREATE POLICY push_subscriptions_isolation ON public.push_subscriptions
          FOR ALL TO PUBLIC
          USING (user_id = public.current_user_id() OR public.is_superadmin())
          WITH CHECK (user_id = public.current_user_id() OR public.is_superadmin());

        DROP POLICY IF EXISTS refresh_sessions_isolation ON public.refresh_sessions;
        CREATE POLICY refresh_sessions_isolation ON public.refresh_sessions
          FOR ALL TO PUBLIC
          USING (user_id = public.current_user_id() OR public.is_superadmin())
          WITH CHECK (user_id = public.current_user_id() OR public.is_superadmin());

        DROP POLICY IF EXISTS teacher_availabilities_isolation ON public.teacher_availabilities;
        CREATE POLICY teacher_availabilities_isolation ON public.teacher_availabilities
          FOR ALL TO PUBLIC
          USING (
            teacher_id = public.current_user_id()
            OR teacher_id IN (SELECT id FROM public.users WHERE tenant_id = public.current_tenant_id() OR public.is_superadmin())
          )
          WITH CHECK (
            teacher_id = public.current_user_id()
            OR teacher_id IN (SELECT id FROM public.users WHERE tenant_id = public.current_tenant_id() OR public.is_superadmin())
          );

        DROP POLICY IF EXISTS teacher_languages_isolation ON public.teacher_languages;
        CREATE POLICY teacher_languages_isolation ON public.teacher_languages
          FOR ALL TO PUBLIC
          USING (
            teacher_id = public.current_user_id()
            OR teacher_id IN (SELECT id FROM public.users WHERE tenant_id = public.current_tenant_id() OR public.is_superadmin())
          )
          WITH CHECK (
            teacher_id = public.current_user_id()
            OR teacher_id IN (SELECT id FROM public.users WHERE tenant_id = public.current_tenant_id() OR public.is_superadmin())
          );
        """
    )

    # 14. Horarios, propuestas de ubicación y reuniones virtuales
    op.execute(
        """
        DROP POLICY IF EXISTS location_proposals_isolation ON public.location_proposals;
        CREATE POLICY location_proposals_isolation ON public.location_proposals
          FOR ALL TO PUBLIC
          USING (
            schedule_id IN (
              SELECT id FROM public.schedules 
              WHERE course_id IN (SELECT id FROM public.courses WHERE tenant_id = public.current_tenant_id() OR public.is_superadmin())
            )
          )
          WITH CHECK (
            schedule_id IN (
              SELECT id FROM public.schedules 
              WHERE course_id IN (SELECT id FROM public.courses WHERE tenant_id = public.current_tenant_id() OR public.is_superadmin())
            )
          );

        DROP POLICY IF EXISTS virtual_meetings_isolation ON public.virtual_meetings;
        CREATE POLICY virtual_meetings_isolation ON public.virtual_meetings
          FOR ALL TO PUBLIC
          USING (
            schedule_id IN (
              SELECT id FROM public.schedules 
              WHERE course_id IN (SELECT id FROM public.courses WHERE tenant_id = public.current_tenant_id() OR public.is_superadmin())
            )
          )
          WITH CHECK (
            schedule_id IN (
              SELECT id FROM public.schedules 
              WHERE course_id IN (SELECT id FROM public.courses WHERE tenant_id = public.current_tenant_id() OR public.is_superadmin())
            )
          );

        DROP POLICY IF EXISTS meeting_logs_isolation ON public.meeting_logs;
        CREATE POLICY meeting_logs_isolation ON public.meeting_logs
          FOR ALL TO PUBLIC
          USING (
            user_id = public.current_user_id()
            OR meeting_id IN (
              SELECT id FROM public.virtual_meetings
              WHERE schedule_id IN (
                SELECT id FROM public.schedules
                WHERE course_id IN (SELECT id FROM public.courses WHERE tenant_id = public.current_tenant_id() OR public.is_superadmin())
              )
            )
          )
          WITH CHECK (
            user_id = public.current_user_id()
            OR meeting_id IN (
              SELECT id FROM public.virtual_meetings
              WHERE schedule_id IN (
                SELECT id FROM public.schedules
                WHERE course_id IN (SELECT id FROM public.courses WHERE tenant_id = public.current_tenant_id() OR public.is_superadmin())
              )
            )
          );
        """
    )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    # Desactivar RLS en todas las tablas
    for tbl in ALL_TABLES:
        op.execute(f"ALTER TABLE public.{tbl} DISABLE ROW LEVEL SECURITY;")

    # Eliminar funciones auxiliares
    op.execute("DROP FUNCTION IF EXISTS public.current_tenant_id();")
    op.execute("DROP FUNCTION IF EXISTS public.is_superadmin();")
    op.execute("DROP FUNCTION IF EXISTS public.current_user_id();")
