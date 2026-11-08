use soroban_sdk::{contracttype, Env};

use crate::types::Plan;

/// Persistent storage keys.
#[contracttype]
pub enum DataKey {
    /// Monotonically-incrementing plan ID counter.
    NextId,
    /// Plan stored by its numeric ID.
    Plan(u64),
}

/// How many ledgers plan data lives without an extend call (~30 days at 5s/ledger).
const PLAN_TTL_LEDGERS: u32 = 518_400; // ~30 days
const PLAN_TTL_THRESHOLD: u32 = 100_000; // bump when below ~5.7 days remaining

pub fn get_next_id(env: &Env) -> u64 {
    env.storage()
        .persistent()
        .get(&DataKey::NextId)
        .unwrap_or(0u64)
}

pub fn set_next_id(env: &Env, id: u64) {
    env.storage()
        .persistent()
        .set(&DataKey::NextId, &id);
    env.storage()
        .persistent()
        .extend_ttl(&DataKey::NextId, PLAN_TTL_THRESHOLD, PLAN_TTL_LEDGERS);
}

pub fn save_plan(env: &Env, plan: &Plan) {
    env.storage()
        .persistent()
        .set(&DataKey::Plan(plan.id), plan);
    env.storage()
        .persistent()
        .extend_ttl(&DataKey::Plan(plan.id), PLAN_TTL_THRESHOLD, PLAN_TTL_LEDGERS);
}

pub fn load_plan(env: &Env, id: u64) -> Option<Plan> {
    env.storage().persistent().get(&DataKey::Plan(id))
}

pub fn extend_plan_ttl(env: &Env, id: u64) {
    env.storage()
        .persistent()
        .extend_ttl(&DataKey::Plan(id), PLAN_TTL_THRESHOLD, PLAN_TTL_LEDGERS);
}

pub fn extend_instance_ttl(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(PLAN_TTL_THRESHOLD, PLAN_TTL_LEDGERS);
}
