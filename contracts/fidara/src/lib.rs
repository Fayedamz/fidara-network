#![no_std]
// create_plan has 9 parameters, which is above clippy's default limit of 7.
// Soroban contracts pass each field individually as the ABI does not support
// struct arguments at the call boundary.
#![allow(clippy::too_many_arguments)]

mod contract;
mod errors;
mod storage;
mod types;

#[cfg(test)]
mod tests;

pub use contract::{FidaraContract, MIN_REVIEW_WINDOW_LEDGERS};
pub use errors::FidaraError;
pub use types::{Milestone, MilestoneStatus, Plan, PlanStatus};
