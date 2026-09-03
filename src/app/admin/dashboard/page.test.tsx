import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

type SessionUser = { id: string; email: string; role: string };
type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: Date;
  templateCount: number;
};
type AdminTemplateRow = {
  id: string;
  name: string;
  originalFilename: string;
  fields: unknown[];
  createdAt: Date;
  ownerName: string | null;
  ownerEmail: string | null;
};

const state = vi.hoisted(() => ({
  session: null as { user: SessionUser } | null,
  users: [] as AdminUserRow[],
  templateRows: [] as AdminTemplateRow[],
}));

vi.mock("@/db", () => ({
  getDb: () => {
    let call = 0;
    return {
      select: () => {
        const isUsersQuery = call === 0;
        call++;
        const builder: {
          from: () => typeof builder;
          leftJoin: () => typeof builder;
          groupBy: () => typeof builder;
          orderBy: () => typeof builder;
          then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => Promise<unknown>;
        } = {
          from: () => builder,
          leftJoin: () => builder,
          groupBy: () => builder,
          orderBy: () => builder,
          then: (resolve, reject) =>
            Promise.resolve(isUsersQuery ? state.users : state.templateRows).then(resolve, reject),
        };
        return builder;
      },
    };
  },
}));

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: () => Promise.resolve(state.session) } },
}));

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers()),
}));

const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  })
);
const redirect = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  })
);
vi.mock("next/navigation", () => ({
  notFound,
  redirect,
  usePathname: () => "/admin/dashboard",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

async function renderAdminPage() {
  const { default: AdminPage } = await import("@/app/admin/dashboard/page");
  const element = await AdminPage();
  render(element);
}

describe("AdminPage", () => {
  beforeEach(() => {
    state.session = { user: { id: "admin-1", email: "admin@example.com", role: "admin" } };
    state.users = [];
    state.templateRows = [];
    notFound.mockClear();
    redirect.mockClear();
  });

  it("redirects to sign-in when there is no session", async () => {
    state.session = null;
    await expect(renderAdminPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/sign-in");
  });

  it("404s for a signed-in user who isn't an admin", async () => {
    state.session = { user: { id: "user-1", email: "user@example.com", role: "user" } };
    await expect(renderAdminPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("lists all users and templates for an admin", async () => {
    state.users = [
      {
        id: "u1",
        name: "Alice",
        email: "alice@example.com",
        role: "admin",
        createdAt: new Date("2026-01-01T00:00:00Z"),
        templateCount: 2,
      },
      {
        id: "u2",
        name: "Bob",
        email: "bob@example.com",
        role: "user",
        createdAt: new Date("2026-01-05T00:00:00Z"),
        templateCount: 0,
      },
    ];
    state.templateRows = [
      {
        id: "t1",
        name: "Offer Letter",
        originalFilename: "offer.docx",
        fields: [{ key: "full_name" }, { key: "start_date" }],
        createdAt: new Date("2026-01-02T00:00:00Z"),
        ownerName: "Alice",
        ownerEmail: "alice@example.com",
      },
    ];

    await renderAdminPage();

    expect(screen.getByRole("heading", { name: "Admin" })).toBeInTheDocument();

    // alice@example.com appears twice: once in the Users table, once as the
    // Templates table's Owner column for the template she owns.
    expect(screen.getAllByText("alice@example.com")).toHaveLength(2);
    expect(screen.getByText("bob@example.com")).toBeInTheDocument();

    expect(screen.getByText("Offer Letter")).toBeInTheDocument();
    expect(screen.getByText("offer.docx")).toBeInTheDocument();
  });
});
