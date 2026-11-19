/**
 * getCurrentUser() (src/lib/auth/guards.ts) reads the temporary-password flag and the roles
 * with one `$queryRaw` statement. Unit suites model "who is signed in" through their
 * `prisma.user.findUnique` fixtures, so a suite's `@/lib/db` mock wraps its fake client:
 *
 *   vi.mock("@/lib/db", async () => ({
 *     prisma: (await import("./helpers/session-access")).withSessionAccessQuery(db),
 *   }));
 *
 * The returned client answers that one statement from the suite's `user.findUnique` fixture
 * (called with the arguments the guard used before) and forwards every other raw statement to
 * the suite's own `$queryRaw` spy, read at call time. The suite's spy therefore never records
 * the session lookup, and its call counts and SQL assertions stay exact.
 */

interface SessionUserFixture {
  mustChangePassword?: boolean;
  roles?: { role: string }[];
}

/** The parts of a suite's fake client this adapter reads (always at call time). */
interface FakeClient {
  user?: { findUnique?: (args: unknown) => Promise<SessionUserFixture | null | undefined> };
  $queryRaw?: RawQuery;
}

type RawQuery = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;

/** True for the guard's session statement (and only for it). */
export function isSessionAccessQuery(strings: readonly string[]): boolean {
  const sql = strings.join("?");
  return sql.includes('u."mustChangePassword" AS "mustChangePassword"') && sql.includes('FROM "user_roles" ur');
}

export function withSessionAccessQuery<T extends object>(prisma: T): T {
  const client = prisma as FakeClient;

  const routedQueryRaw: RawQuery = async (strings, ...values) => {
    if (isSessionAccessQuery(strings)) {
      const user = await client.user?.findUnique?.({
        where: { id: values[0] },
        select: { mustChangePassword: true, roles: { select: { role: true } } },
      });
      return user
        ? [{ mustChangePassword: user.mustChangePassword ?? false, roles: (user.roles ?? []).map((r) => r.role) }]
        : [];
    }
    return client.$queryRaw ? client.$queryRaw(strings, ...values) : [];
  };

  return new Proxy(prisma, {
    get(target, property, receiver) {
      return property === "$queryRaw" ? routedQueryRaw : Reflect.get(target, property, receiver);
    },
  });
}
