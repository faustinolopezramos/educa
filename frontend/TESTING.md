# Frontend Testing Guide

Tests para el frontend de Educa usando **Vitest** + **React Testing Library**.

## Setup

Las dependencias ya están configuradas. Solo necesitas instalarlas:

```bash
cd frontend
npm install
```

## Ejecutar Tests

### Modo normal
```bash
npm test
```

### Modo watch (re-ejecuta al cambiar archivos)
```bash
npm run test:watch
```

### UI de Vitest (interfaz visual)
```bash
npm run test:ui
```

### Con cobertura
```bash
npm run test:coverage
```

## Estructura de Tests

```
src/
├── auth/__tests__/
│   ├── AuthContext.test.tsx     # Contexto de autenticación
│   └── ProtectedRoute.test.tsx  # Rutas protegidas
├── pages/__tests__/
│   ├── Login.test.tsx           # Página de login
│   └── ...
├── components/__tests__/
│   ├── ui.test.tsx              # Componentes UI (Button, Input, Card)
│   └── ...
├── lib/__tests__/
│   ├── api.test.ts              # API client y token management
│   └── ...
└── test/
    ├── setup.ts                 # Setup global de tests
    ├── fixtures.ts              # Factories de datos (createUser, etc)
    ├── mocks.ts                 # Mocks de librerías (api, localStorage)
    └── utils.tsx                # Render con providers
```

## Escribir Nuevos Tests

### Ejemplo básico: Componente UI

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "../test/utils";
import { MyComponent } from "../components/MyComponent";

describe("MyComponent", () => {
  it("should render text", () => {
    render(<MyComponent />);
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("should handle click", () => {
    let clicked = false;
    render(<MyComponent onClick={() => (clicked = true)} />);
    fireEvent.click(screen.getByRole("button"));
    expect(clicked).toBe(true);
  });
});
```

### Ejemplo: Hook personalizado

```tsx
import { renderHook, act } from "@testing-library/react";
import { useMyHook } from "../lib/hooks";

describe("useMyHook", () => {
  it("should update state", () => {
    const { result } = renderHook(() => useMyHook());
    
    act(() => {
      result.current.increment();
    });
    
    expect(result.current.count).toBe(1);
  });
});
```

### Ejemplo: Componente con mock de API

```tsx
import { vi } from "vitest";
import * as api from "../lib/api";

vi.mock("../lib/api");

describe("MyComponent", () => {
  it("should fetch data", async () => {
    vi.mocked(api.api.get).mockResolvedValueOnce({
      data: { id: 1, name: "Test" },
    } as any);
    
    render(<MyComponent />);
    
    await waitFor(() => {
      expect(screen.getByText("Test")).toBeInTheDocument();
    });
  });
});
```

## Fixtures para Datos de Prueba

Usa `src/test/fixtures.ts` para crear datos de prueba:

```tsx
import { createUser, createEnrollment } from "../test/fixtures";

const user = createUser({ role: "admin" });
const enrollment = createEnrollment({ status: "completed" });
```

## Buenas Prácticas

1. **Un concepto por test:** Cada `it()` debe probar una sola cosa
2. **Nombres descriptivos:** `should_render_loading_state` es mejor que `test1`
3. **Arrange-Act-Assert:** Organiza tests en 3 fases
4. **Mock solo lo externo:** API, localStorage, librerías de routing
5. **Evita implementación:** Testa comportamiento, no detalles internos
6. **Usa RTL queries:** `getByRole`, `getByLabelText` (no `getByTestId` siempre)

## Casos de Uso Comunes

### Testing de Formularios con React Hook Form + Zod

```tsx
const { render, screen, fireEvent, waitFor } = require("@testing-library/react");
import { Login } from "../pages/Login";
import * as AuthContext from "../auth/AuthContext";

vi.mock("../auth/AuthContext");

it("should validate email format", async () => {
  const mockLogin = vi.fn();
  vi.mocked(AuthContext.useAuth).mockReturnValue({
    login: mockLogin,
    // ...
  } as any);

  render(<Login />);
  
  fireEvent.change(screen.getByPlaceholderText("admin@educa.com"), {
    target: { value: "invalid-email" },
  });
  
  fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
  
  await waitFor(() => {
    expect(screen.getByText("Correo inválido")).toBeInTheDocument();
  });
});
```

### Testing de Contextos

```tsx
import { renderHook, act, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "../auth/AuthContext";

it("should login and update user", async () => {
  const wrapper = ({ children }: any) => <AuthProvider>{children}</AuthProvider>;
  const { result } = renderHook(() => useAuth(), { wrapper });

  await act(async () => {
    await result.current.login("admin@educa.com", "password");
  });

  expect(result.current.user).not.toBeNull();
});
```

### Testing de TanStack Query (useQuery)

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

it("should fetch and display data", async () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <MyComponent />
    </QueryClientProvider>
  );

  await waitFor(() => {
    expect(screen.getByText("Data loaded")).toBeInTheDocument();
  });
});
```

## Cobertura Esperada

### Fase 1 (Implementado)
- ✅ AuthContext (auth/AuthContext.test.tsx)
- ✅ Login (pages/Login.test.tsx)
- ✅ ProtectedRoute (auth/ProtectedRoute.test.tsx)
- ✅ UI Components (components/ui.test.tsx)
- ✅ API utilities (lib/api.test.ts)

**Cobertura:** ~25-30% del código

### Fase 2 (Próximo)
- Dashboard components (StudentDashboard, TeacherDashboard, AdminDashboard)
- Feature components (EnrollWizard, GradeTable, SchedulePlanner)
- Hooks personalizados (useLocationProposals, etc)

**Meta:** 60-70% de cobertura

### Fase 3 (Ideal)
- E2E tests con Playwright
- Integration tests completos
- Performance tests

**Meta:** 85%+ de cobertura

## Debugging Tests

### Ver detalles de una query
```tsx
import { screen, logTestingPlaygroundURL } from "@testing-library/react";

it("should render", () => {
  render(<MyComponent />);
  logTestingPlaygroundURL(screen.getByRole("button"));
});
```

### Usar `screen.debug()`
```tsx
it("should render", () => {
  render(<MyComponent />);
  screen.debug(); // imprime el DOM
});
```

## Troubleshooting

### Error: "Cannot find module '@testing-library/react'"
```bash
npm install
```

### Error: "setTimeout is not defined"
El setup.ts debe estar configurado correctamente. Verifica `vitest.config.ts`.

### Mock no funciona
Asegúrate de mockear ANTES de importar el módulo:
```tsx
vi.mock("../lib/api");  // ✅ Antes
import { api } from "../lib/api";  // ✅ Después
```

## Recursos

- [Vitest Docs](https://vitest.dev)
- [React Testing Library](https://testing-library.com/react)
- [Testing Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
