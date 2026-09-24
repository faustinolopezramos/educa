import { PageHeader } from "../../components/ui";
import { SchedulePlanner } from "../schedules/SchedulePlanner";

/**
 * El horario completo de la academia, como sección propia.
 *
 * Antes vivía embebido al final de "Resumen" — un calendario de arrastrar y
 * soltar compitiendo por espacio con los KPIs y los pendientes — y el id de
 * menú que le hubiera correspondido, "schedules", no lo enlazaba nada en toda
 * la aplicación. Este archivo ya existía con el nombre correcto; sólo nadie
 * lo montaba.
 */
export function SchedulesPanel() {
  return (
    <div>
      <PageHeader
        title="Horarios"
        description="Arrastra una clase para moverla; el sistema avisa si choca con otra."
      />
      <SchedulePlanner />
    </div>
  );
}
