import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "../../../test/utils";
import { StudentAssignmentModal } from "../StudentAssignmentModal";
import * as toast from "../../../lib/toast";

vi.mock("../../../lib/api");

const mockAssignment = {
  id: 101,
  course_id: 10,
  title: "Ensayo Argumentativo",
  description: "Escribe 200 palabras sobre tecnología",
  resource_url: "https://example.com/guide.pdf",
  due_date: new Date(Date.now() + 86400000).toISOString(),
  created_at: new Date().toISOString(),
};

describe("StudentAssignmentModal", () => {
  it("renders modal and validates that URL starts with http or https", async () => {
    const notifySpy = vi.spyOn(toast, "notify");
    const onClose = vi.fn();
    const onSubmitted = vi.fn();

    render(
      <StudentAssignmentModal
        assignment={mockAssignment}
        courseName="Inglés B2"
        onClose={onClose}
        onSubmitted={onSubmitted}
      />
    );

    // Initial state is the "link" tab
    expect(screen.getByText("Entrega de Tarea")).toBeInTheDocument();

    const input = screen.getByPlaceholderText(/drive\.google\.com/);
    fireEvent.change(input, { target: { value: "invalid-url-without-protocol" } });

    const submitBtn = screen.getByRole("button", { name: "Enviar Tarea" });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(notifySpy).toHaveBeenCalledWith(
        expect.stringMatching(/El enlace debe comenzar con https:\/\/ o http:\/\/|Ingresa una URL válida/),
        "error"
      );
    });
    expect(onSubmitted).not.toHaveBeenCalled();
  });

  it("switches to text tab and displays live word and character count", () => {
    render(
      <StudentAssignmentModal
        assignment={mockAssignment}
        courseName="Inglés B2"
        onClose={vi.fn()}
        onSubmitted={vi.fn()}
      />
    );

    const textTabBtn = screen.getByRole("button", { name: /Texto en Línea/ });
    fireEvent.click(textTabBtn);

    const textarea = screen.getByPlaceholderText(/Escribe tu respuesta/);
    fireEvent.change(textarea, { target: { value: "This is a great essay about artificial intelligence." } });

    expect(screen.getByText(/8 palabra\(s\)/)).toBeInTheDocument();
    expect(screen.getByText(/52 caracteres/)).toBeInTheDocument();
  });
});
