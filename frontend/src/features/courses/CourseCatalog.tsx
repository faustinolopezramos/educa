import { useMemo, useState } from "react";

import {
  ActionMenu,
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  SearchInput,
  SegmentedControl,
  Select,
  Toolbar,
} from "../../components/ui";
import { IconBook } from "../../components/icons";
import {
  useCourses,
  useLanguages,
  useLevels,
  useSchedules,
  useUsers,
} from "../../lib/queries";
import type { Course, CourseStatus, TrackKind } from "../../lib/types";
import { CourseStatusBadge } from "../admin/CourseStatusControl";

const TRACK_LABELS: Record<TrackKind, string> = {
  language: "Idiomas",
  digital_skill: "Competencias Digitales",
  business_skill: "Competencias de Negocios",
};

const TRACK_BADGE_COLORS: Record<TrackKind, "indigo" | "green" | "amber"> = {
  language: "indigo",
  digital_skill: "green",
  business_skill: "amber",
};

interface CourseCatalogProps {
  onEnroll?: (courseId: number) => void;
  onEditCourse?: (course: Course) => void;
  onAssignTeacher?: (courseId: number) => void;
  onAddSchedule?: (courseId: number) => void;
  onNewCourse?: () => void;
}

export function CourseCatalog({
  onEnroll,
  onEditCourse,
  onAssignTeacher,
  onAddSchedule,
  onNewCourse,
}: CourseCatalogProps) {
  const { data: courses = [], isLoading: coursesLoading } = useCourses();
  const { data: languages = [] } = useLanguages();
  const { data: levels = [] } = useLevels();
  const { data: schedules = [] } = useSchedules();
  const { data: teachers = [] } = useUsers("teacher");

  // Filter States
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTrackKind, setSelectedTrackKind] = useState<TrackKind | "all">("all");
  const [selectedLanguageId, setSelectedLanguageId] = useState<number>(0);
  const [selectedLevelId, setSelectedLevelId] = useState<number>(0);
  const [selectedStatus, setSelectedStatus] = useState<CourseStatus | "all">("all");

  const levelMap = useMemo(() => {
    const map = new Map<number, (typeof levels)[0]>();
    for (const l of levels) map.set(l.id, l);
    return map;
  }, [levels]);

  const languageMap = useMemo(() => {
    const map = new Map<number, (typeof languages)[0]>();
    for (const g of languages) map.set(g.id, g);
    return map;
  }, [languages]);

  const filtersActive =
    searchTerm.trim().length > 0 ||
    selectedTrackKind !== "all" ||
    selectedLanguageId > 0 ||
    selectedLevelId > 0 ||
    selectedStatus !== "all";

  function clearFilters() {
    setSearchTerm("");
    setSelectedTrackKind("all");
    setSelectedLanguageId(0);
    setSelectedLevelId(0);
    setSelectedStatus("all");
  }

  // Filter Courses based on active criteria
  const filteredCourses = useMemo(() => {
    return courses.filter((c) => {
      // Search term
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const level = levelMap.get(c.level_id);
        const language = level ? languageMap.get(level.language_id) : null;
        const matchesName = c.name.toLowerCase().includes(query);
        const matchesLevel = level?.code.toLowerCase().includes(query) || level?.name.toLowerCase().includes(query);
        const matchesArea = language?.name.toLowerCase().includes(query);
        if (!matchesName && !matchesLevel && !matchesArea) return false;
      }

      // Course Status
      if (selectedStatus !== "all" && c.status !== selectedStatus) return false;

      // Level and Language filter
      const lvl = levelMap.get(c.level_id);
      if (!lvl) return false;

      if (selectedLevelId > 0 && c.level_id !== selectedLevelId) return false;
      if (selectedLanguageId > 0 && lvl.language_id !== selectedLanguageId) return false;

      // Track Kind filter
      const lang = languageMap.get(lvl.language_id);
      if (selectedTrackKind !== "all" && lang?.kind !== selectedTrackKind) return false;

      return true;
    });
  }, [courses, searchTerm, selectedStatus, selectedLevelId, selectedLanguageId, selectedTrackKind, levelMap, languageMap]);

  // Group Courses by Área Académica (Language / Materia)
  const groupedCourses = useMemo(() => {
    const groups: Array<{
      language: (typeof languages)[0];
      courses: Course[];
    }> = [];

    // Grouping map
    const map = new Map<number, Course[]>();
    for (const c of filteredCourses) {
      const lvl = levelMap.get(c.level_id);
      if (!lvl) continue;
      const langId = lvl.language_id;
      if (!map.has(langId)) map.set(langId, []);
      map.get(langId)!.push(c);
    }

    for (const lang of languages) {
      const cList = map.get(lang.id);
      if (cList && cList.length > 0) {
        groups.push({
          language: lang,
          courses: cList,
        });
      }
    }

    return groups;
  }, [filteredCourses, languages, levelMap]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Catálogo de Cursos por Área Académica"
        description="Organización jerárquica de la oferta académica por materia, nivel y curso activo."
        actions={
          onNewCourse ? (
            <Button onClick={onNewCourse}>+ Nuevo curso</Button>
          ) : undefined
        }
      />

      {/* Quick Category Filter Segmented Control */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          value={selectedTrackKind}
          onChange={(val) => {
            setSelectedTrackKind(val);
            setSelectedLanguageId(0);
          }}
          options={[
            { value: "all", label: "Todas las áreas", count: courses.length },
            {
              value: "language",
              label: "Idiomas",
              count: courses.filter((c) => languageMap.get(levelMap.get(c.level_id)?.language_id ?? 0)?.kind === "language").length,
            },
            {
              value: "digital_skill",
              label: "Competencias Digitales",
              count: courses.filter((c) => languageMap.get(levelMap.get(c.level_id)?.language_id ?? 0)?.kind === "digital_skill").length,
            },
            {
              value: "business_skill",
              label: "Competencias de Negocios",
              count: courses.filter((c) => languageMap.get(levelMap.get(c.level_id)?.language_id ?? 0)?.kind === "business_skill").length,
            },
          ]}
        />
      </div>

      {/* Quick Filter Toolbar */}
      <Toolbar>
        <SearchInput
          placeholder="Buscar por curso, nivel o área académica…"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />

        <Select
          className="w-full sm:w-56"
          value={selectedLanguageId}
          onChange={(e) => {
            const val = Number(e.target.value);
            setSelectedLanguageId(val);
            setSelectedLevelId(0);
          }}
        >
          <option value={0}>Todas las áreas académicas</option>
          {languages
            .filter((l) => selectedTrackKind === "all" || l.kind === selectedTrackKind)
            .map((lang) => (
              <option key={lang.id} value={lang.id}>
                {lang.name} ({TRACK_LABELS[lang.kind]})
              </option>
            ))}
        </Select>

        <Select
          className="w-full sm:w-48"
          value={selectedLevelId}
          onChange={(e) => setSelectedLevelId(Number(e.target.value))}
        >
          <option value={0}>Todos los niveles</option>
          {levels
            .filter((l) => selectedLanguageId === 0 || l.language_id === selectedLanguageId)
            .map((l) => {
              const lang = languageMap.get(l.language_id);
              return (
                <option key={l.id} value={l.id}>
                  {lang ? `${lang.name} · ` : ""}{l.code} ({l.name})
                </option>
              );
            })}
        </Select>

        <Select
          className="w-full sm:w-44"
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value as CourseStatus | "all")}
        >
          <option value="all">Todos los estados</option>
          <option value="in_progress">En impartición</option>
          <option value="enrolling">Admitiendo matrícula</option>
          <option value="draft">Borrador</option>
          <option value="closed">Cerrados</option>
          <option value="archived">Archivados</option>
        </Select>

        {filtersActive && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Limpiar filtros
          </Button>
        )}
      </Toolbar>

      {/* Main Content: Grouped Sections by Área Académica */}
      {coursesLoading ? (
        <div className="py-12 text-center text-slate-400">Cargando catálogo académico…</div>
      ) : groupedCourses.length === 0 ? (
        <EmptyState
          icon={<IconBook className="h-6 w-6" />}
          title={filtersActive ? "Ningún curso coincide con los filtros" : "No hay cursos registrados"}
          message={
            filtersActive
              ? "Prueba ajustando los filtros de área académica, nivel o término de búsqueda."
              : "Comienza creando el primer curso en la estructura académica."
          }
          action={
            filtersActive ? (
              <Button variant="secondary" onClick={clearFilters}>
                Limpiar filtros
              </Button>
            ) : onNewCourse ? (
              <Button onClick={onNewCourse}>+ Nuevo curso</Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-8">
          {groupedCourses.map(({ language, courses: langCourses }) => (
            <div key={language.id} className="space-y-3.5">
              {/* Visual Section Header for Área Académica */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-2.5">
                <div className="flex items-center gap-2.5">
                  <Badge color={TRACK_BADGE_COLORS[language.kind]}>
                    {TRACK_LABELS[language.kind]}
                  </Badge>
                  <h2 className="text-base font-bold text-slate-900 tracking-tight">
                    Área Académica: {language.name}
                  </h2>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600 font-mono">
                    {langCourses.length} {langCourses.length === 1 ? "curso" : "cursos"}
                  </span>
                </div>
              </div>

              {/* Grid of Courses under this Área Académica */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {langCourses.map((c) => {
                  const level = levelMap.get(c.level_id);
                  const activeCount = c.seats_taken;
                  const maxSeats = c.max_students || 1;
                  const capacityPct = Math.min(100, Math.round((activeCount / maxSeats) * 100));

                  const courseSchedules = schedules.filter((s) => s.course_id === c.id);
                  const leadTeacherId = courseSchedules.find((s) => s.teacher_id)?.teacher_id;
                  const assignedTeacher = leadTeacherId
                    ? teachers.find((t) => t.id === leadTeacherId)
                    : null;

                  return (
                    <Card key={c.id} padding="sm" className="flex flex-col justify-between hover:border-slate-300 transition-colors">
                      <div className="space-y-2">
                        {/* Header Badges & Actions */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {level && <Badge color="sky">{level.code}</Badge>}
                            <Badge color="slate">
                              {c.periodicity === "bimensual"
                                ? "Bimensual"
                                : c.periodicity === "trimestral"
                                ? "Trimestral"
                                : c.periodicity === "cuatrimestral"
                                ? "Cuatrimestral"
                                : c.periodicity === "semestral"
                                ? "Semestral"
                                : c.periodicity === "anual"
                                ? "Anual"
                                : "Mensual"}
                            </Badge>
                            <CourseStatusBadge status={c.status} />
                          </div>

                          <ActionMenu
                            items={[
                              ...(onEnroll ? [{ label: "Inscribir alumno", onClick: () => onEnroll(c.id) }] : []),
                              ...(onAssignTeacher
                                ? [
                                    {
                                      label: assignedTeacher ? "Cambiar profesor" : "Asignar profesor",
                                      onClick: () => onAssignTeacher(c.id),
                                    },
                                  ]
                                : []),
                              ...(onAddSchedule ? [{ label: "Añadir horario", onClick: () => onAddSchedule(c.id) }] : []),
                              ...(onEditCourse ? [{ label: "Editar curso", onClick: () => onEditCourse(c) }] : []),
                            ]}
                          />
                        </div>

                        {/* Title and Level Subtitle */}
                        <div>
                          <h3 className="font-bold text-slate-900 text-sm">{c.name}</h3>
                          <p className="text-xs text-slate-500 mt-0.5 truncate">
                            Nivel: <span className="font-medium text-slate-700">{level?.name ?? `#${c.level_id}`}</span>
                          </p>
                        </div>
                      </div>

                      {/* Course Card Details & Progress */}
                      <div className="mt-4 space-y-3 pt-3 border-t border-slate-100 text-xs">
                        {/* Teacher Assigned Info */}
                        <div className="flex items-center justify-between text-slate-600">
                          <span className="text-slate-400 font-medium">Profesor:</span>
                          <span className="font-medium text-slate-800">
                            {assignedTeacher ? assignedTeacher.full_name : "Sin asignar"}
                          </span>
                        </div>

                        {/* Occupancy / Seat Progress Bar */}
                        <div>
                          <div className="flex items-center justify-between text-[11px] font-medium text-slate-600 mb-1">
                            <span>Cupo: {activeCount} / {c.max_students}</span>
                            <span className="font-mono">{capacityPct}%</span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={`h-full transition-all ${
                                capacityPct >= 90
                                  ? "bg-amber-500"
                                  : capacityPct >= 100
                                  ? "bg-red-500"
                                  : "bg-brand-600"
                              }`}
                              style={{ width: `${capacityPct}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
