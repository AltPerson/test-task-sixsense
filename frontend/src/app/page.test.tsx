import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "@/app/(app)/page";

describe("Home", () => {
  it("renders the application shell", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { name: "Traffic search" }),
    ).toBeInTheDocument();
  });
});
