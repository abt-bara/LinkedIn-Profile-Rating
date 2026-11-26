export const ACTIONS = Object.freeze({
  analysisCreate: "analysis:create",
  analysisList: "analysis:list",
  signOut: "auth:signout",
});

const ROLES = Object.freeze({
  admin:  new Set(Object.values(ACTIONS)),
  paid:   new Set(Object.values(ACTIONS)),
  unpaid: new Set([ACTIONS.analysisList, ACTIONS.signOut]),
});

export const can = (role, action) => ROLES[role]?.has(action) ?? false;