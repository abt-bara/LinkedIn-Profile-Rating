const ACTIONS = Object.freeze({
  analysisCreate: "analysis:create",
  analysisList: "analysis:list",
  signOut: "analysis:list",
});

class entity {
  #analysisCreate;
  #analysisList;
  #signOut;
  constructor(analysisCreate, analysisList, signOut) {
    this.#analysisCreate = analysisCreate;
    this.#analysisList = analysisList;
    this.#signOut = signOut;
  }
}
function Roles() {
  const admin = entity.freeze(true, true, true);
  const paid = entity.freeze(true, true, true);
  const unpaid = entity.freeze(false, true, true);
}
export { ACTIONS, entity, Roles };
