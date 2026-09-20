import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SignInForm } from "@/features/auth/sign-in-form";

const router = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

describe("SignInForm", () => {
  beforeEach(() => {
    router.replace.mockReset();
    router.refresh.mockReset();
    vi.unstubAllGlobals();
  });

  it("fills demo credentials without submitting", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<SignInForm />);

    fireEvent.click(screen.getByRole("button", { name: "Use analyst" }));

    expect(screen.getByLabelText("Email")).toHaveValue(
      "ana@quillmere.example",
    );
    expect(screen.getByLabelText("Password")).toHaveValue("demo-analyst");
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Use observer" }));

    expect(screen.getByLabelText("Email")).toHaveValue(
      "oli@quillmere.example",
    );
    expect(screen.getByLabelText("Password")).toHaveValue("demo-observer");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows an understandable invalid-credentials error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          { error: { code: "invalid_credentials", message: "Invalid." } },
          { status: 401 },
        ),
      ),
    );
    render(<SignInForm />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "wrong@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "wrong-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Email or password is incorrect.",
    );
  });

  it("shows the normalized rate-limit retry timing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          {
            error: {
              code: "login_rate_limited",
              message: "Too many attempts.",
              retry_after_seconds: 17,
            },
          },
          { status: 429 },
        ),
      ),
    );
    render(<SignInForm />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "user@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "wrong-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Too many sign-in attempts.");
    expect(alert).toHaveTextContent("Try again in 17 seconds.");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
  });

  it("preserves an active cooldown when another demo account is selected", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json(
        {
          error: {
            code: "login_rate_limited",
            message: "Too many attempts.",
            retry_after_seconds: 30,
          },
        },
        { status: 429 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<SignInForm />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "rate-limited@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "wrong-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Try again in 30 seconds.",
    );

    fireEvent.click(screen.getByRole("button", { name: "Use observer" }));

    expect(screen.getByLabelText("Email")).toHaveValue(
      "oli@quillmere.example",
    );
    expect(screen.getByLabelText("Password")).toHaveValue("demo-observer");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Try again in 30 seconds.",
    );
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("navigates to the protected workspace after login", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          user: {
            id: "user-1",
            email: "ana@quillmere.example",
            display_name: "Ana",
            role: "analyst",
            permissions: [],
            sensor_ids: [],
          },
        }),
      ),
    );
    render(<SignInForm />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "ana@quillmere.example" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "demo-analyst" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/"));
    expect(router.refresh).toHaveBeenCalledOnce();
  });
});
