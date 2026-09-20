import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import Home from "@/app/(app)/page";

vi.mock("@/features/search/ui/search-builder", () => ({
  SearchBuilder: () => <h1>Traffic search</h1>,
}));

describe("Home", () => {
  it("renders the application shell", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { name: "Traffic search" }),
    ).toBeInTheDocument();
  });
});
