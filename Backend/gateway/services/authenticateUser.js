import config from "../../shared/config/config.json" with { type: "json" };

const AUTH_TIMEOUT_MS = 3000;
const GATEWAY_REJECTED_MESSAGE = "Gateway authentication failed.";

const MESSAGES = {
  400: "Bad request.",
  401: "Unauthorized.",
  403: "Forbidden.",
  500: "Internal server error.",
  502: "Authentication server returned an invalid response.",
  503: "Authentication server unreachable.",
  504: "Authentication server timed out.",
};

const fail = (status) => ({ ok: false, status });

async function readJson(r) {
  try {
    return await r.json();
  } catch {
    return null;
  }
}

// The auth server uses 403 for two different things:
//   1. it did not accept OUR token   -> our config is wrong (server problem)
//   2. the user's role lacks the action -> a real permission problem
// Only the second one is a real 403 for the client.
function isGatewayRejection(body) {
  return (
    body?.code === "GATEWAY_AUTH_FAILED" ||
    body?.message === GATEWAY_REJECTED_MESSAGE
  );
}

async function authenticateUser({ cookie, action, targetUserId }) {
  const internalToken = process.env.AUTH_INTERNAL_TOKEN;
  if (!internalToken) {
    console.error("AUTH_INTERNAL_TOKEN is not configured.");
    return fail(500);
  }

  let r;
  try {
    r = await fetch(`${config.server_url.auth_server}/authorize`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${internalToken}`,
        cookie: cookie ?? "",
      },
      body: JSON.stringify({
        action,
        ...(targetUserId !== undefined ? { targetUserId } : {}),
      }),
      redirect: "manual",
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    });
  } catch (err) {
    console.error("auth call failed:", err.name, err.cause?.code ?? err.message);
    return fail(err.name === "TimeoutError" ? 504 : 503);
  }

  if (r.status === 401 || (r.status >= 300 && r.status < 400)) {
    return fail(401);
  }

  if (r.status === 403) {
    const body = await readJson(r);

    if (isGatewayRejection(body)) {
      // Not the user's fault: AUTH_INTERNAL_TOKEN differs between the two services.
      console.error(
        "auth server rejected the gateway token. Check AUTH_INTERNAL_TOKEN on both services.",
      );
      return fail(500);
    }

    console.warn("permission denied:", { action, reason: body?.message });
    return fail(403);
  }

  if (r.status === 400) {
    // the gateway sent an action the auth server doesn't know: our bug, not the user's
    console.error("auth server rejected action:", action);
    return fail(500);
  }

  if (!r.ok) {
    console.error("auth server status:", r.status);
    return fail(502);
  }

  const user = await readJson(r);
  if (typeof user?.userId !== "string" || typeof user?.role !== "string") {
    return fail(502);
  }

  return { ok: true, user: { userId: user.userId, role: user.role } };
}

const authorize = (action, { targetFrom } = {}) => async (req, res, next) => {
  try {
    const result = await authenticateUser({
      cookie: req.headers.cookie,
      action,
      targetUserId: targetFrom?.(req),
    });
    if (!result.ok) {
      return res
        .status(result.status)
        .json({ message: MESSAGES[result.status] ?? MESSAGES[500] });
    }

    req.user = result.user; // { userId, role }, from the auth server only
    return next();
  } catch (err) {
    console.error("authorize failed:", err);
    return res.status(500).json({ message: MESSAGES[500] });
  }
};

export { authenticateUser, authorize };