import config from "../../shared/config/config.json" with { type: "json" };

async function authenticateUser({ cookie, action, targetUserId }) {
  const internalToken = process.env.AUTH_INTERNAL_TOKEN;
  if (!internalToken) {
    throw new Error("AUTH_INTERNAL_TOKEN is not configured.");
  }

  const r = await fetch(`${config.server_url.auth_server}/authorize`, {
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
    signal: AbortSignal.timeout(3000),
  });

  if (r.ok) return { ok: true, user: await r.json() };
  if (r.status === 403) return { ok: false, status: 502 };
  if (r.status === 401 || (r.status >= 300 && r.status < 400)) return { ok: false, status: 401 };
  return { ok: false, status: 502 };
}

const authorize = (action, { targetFrom } = {}) => async (req, res, next) => {
  try {
    const result = await authenticateUser({
      cookie: req.headers.cookie,
      action,
      targetUserId: targetFrom?.(req),
    });
    if (!result.ok) return res.status(result.status).json({ message: "Not allowed." });

    req.user = result.user; // id and role, from the auth server
    next();
  } catch (err) {
    console.error("authorize failed:", err);
    res.status(502).json({ message: "Authentication server unreachable." });
  }
};
export { authenticateUser, authorize };