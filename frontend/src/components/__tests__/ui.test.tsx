import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "../../test/utils";
import { Button, Input, Card, Modal, ModalActions } from "../ui";

describe("Button", () => {
  it("should render button with text", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole("button", { name: "Click me" })).toBeInTheDocument();
  });

  it("should handle click events", () => {
    let clicked = false;
    render(<Button onClick={() => (clicked = true)}>Click</Button>);
    fireEvent.click(screen.getByRole("button"));
    expect(clicked).toBe(true);
  });

  it("should apply primary variant by default", () => {
    render(<Button>Primary</Button>);
    const button = screen.getByRole("button");
    expect(button.className).toContain("bg-brand-600");
  });

  it("should apply secondary variant", () => {
    render(<Button variant="secondary">Secondary</Button>);
    const button = screen.getByRole("button");
    expect(button.className).toContain("bg-white");
  });

  it("should apply danger variant", () => {
    render(<Button variant="danger">Delete</Button>);
    const button = screen.getByRole("button");
    expect(button.className).toContain("bg-red-600");
  });

  it("should be disabled when disabled prop is true", () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("should accept custom className", () => {
    render(<Button className="custom-class">Custom</Button>);
    const button = screen.getByRole("button");
    expect(button.className).toContain("custom-class");
  });
});

describe("Input", () => {
  it("should render input element", () => {
    render(<Input type="text" placeholder="Enter text" />);
    expect(screen.getByPlaceholderText("Enter text")).toBeInTheDocument();
  });

  it("should handle text input", () => {
    const { container } = render(
      <Input type="text" data-testid="test-input" />,
    );
    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: "test value" } });
    expect(input.value).toBe("test value");
  });

  it("should handle password input", () => {
    const { container } = render(
      <Input type="password" data-testid="test-input" />,
    );
    const input = container.querySelector('input[type="password"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: "secret" } });
    expect(input.value).toBe("secret");
  });

  it("should be disabled when disabled prop is true", () => {
    render(<Input disabled />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  it("should forward ref correctly", () => {
    let inputRef: HTMLInputElement | null = null;
    render(
      <Input ref={(el) => (inputRef = el)} data-testid="test-input" />,
    );
    expect(inputRef).toBeInstanceOf(HTMLInputElement);
  });
});

describe("Card", () => {
  it("should render card with children", () => {
    render(<Card>Card content</Card>);
    expect(screen.getByText("Card content")).toBeInTheDocument();
  });

  it("should apply custom className", () => {
    const { container } = render(
      <Card className="custom-card">Content</Card>,
    );
    const card = container.querySelector(".custom-card");
    expect(card).toBeInTheDocument();
  });

  it("should have correct base styles", () => {
    const { container } = render(<Card>Content</Card>);
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain("rounded-xl");
    expect(card.className).toContain("border");
    expect(card.className).toContain("bg-white");
  });
});

describe("Modal", () => {
  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(
      <Modal title="Editar curso" onClose={onClose}>
        <p>contenido</p>
      </Modal>,
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("submits from the keyboard when given onSubmit", () => {
    const onSubmit = vi.fn();
    render(
      <Modal
        title="Editar curso"
        onClose={() => {}}
        onSubmit={onSubmit}
        footer={
          <ModalActions>
            <Button type="submit">Guardar</Button>
          </ModalActions>
        }
      >
        <Input placeholder="Nombre" />
      </Modal>,
    );

    fireEvent.submit(screen.getByRole("dialog"));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("does not submit when a non-submit button in the footer is clicked", () => {
    const onSubmit = vi.fn();
    const onClose = vi.fn();
    render(
      <Modal
        title="Editar curso"
        onClose={onClose}
        onSubmit={onSubmit}
        footer={
          <ModalActions>
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit">Guardar</Button>
          </ModalActions>
        }
      >
        <Input placeholder="Nombre" />
      </Modal>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onClose).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("focuses the first field rather than the close button", () => {
    render(
      <Modal title="Editar curso" onClose={() => {}}>
        <Input placeholder="Nombre" />
      </Modal>,
    );

    expect(document.activeElement).toBe(screen.getByPlaceholderText("Nombre"));
  });

  it("renders on <body>, escaping any transformed ancestor", () => {
    // The app's <main> keeps a transform (animate-fade-in, fill-mode forwards),
    // which would make `position: fixed` resolve against <main>'s box instead
    // of the window and strand the dialog half off-screen on a long page.
    const { container } = render(
      <div style={{ transform: "translateY(0)" }}>
        <Modal title="Editar curso" onClose={() => {}}>
          <p>contenido</p>
        </Modal>
      </div>,
    );

    const dialog = screen.getByRole("dialog");
    expect(container).not.toContainElement(dialog);
    expect(document.body).toContainElement(dialog);
  });

  it("shows the description under the title", () => {
    render(
      <Modal title="Editar curso" description="Cambia el cupo y las fechas." onClose={() => {}}>
        <p>contenido</p>
      </Modal>,
    );

    expect(screen.getByText("Cambia el cupo y las fechas.")).toBeInTheDocument();
  });
});
