// ---------------------------------------------------------------------------
// Contract client helpers.
//
// Wraps @stellar/stellar-sdk contract interactions. All calls produce a
// transaction that must be signed by the user's wallet (Freighter) and
// submitted to the Stellar Testnet RPC.
// ---------------------------------------------------------------------------

import {
  Account,
  Address,
  BASE_FEE,
  Contract,
  Networks,
  nativeToScVal,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";
// In stellar-sdk v13, the RPC utilities are exported as `rpc` (lower-case),
// not as `SorobanRpc`.
import { Server as RpcServer, assembleTransaction, Api as RpcApi } from "@stellar/stellar-sdk/rpc";

import type { CreatePlanParams, Plan } from "../types/contract";
import { signXdr } from "./wallet";

export const TESTNET_RPC = "https://soroban-testnet.stellar.org";
export const NETWORK_PASSPHRASE = Networks.TESTNET;

// Replace with the deployed contract address after deployment.
export const CONTRACT_ID: string =
  import.meta.env.VITE_CONTRACT_ID ?? "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4";

const rpc = new RpcServer(TESTNET_RPC);

// ---------------------------------------------------------------------------
// Low-level helper: build → simulate → sign → submit
// ---------------------------------------------------------------------------

async function invokeContract(
  callerPublicKey: string,
  method: string,
  args: xdr.ScVal[]
): Promise<xdr.ScVal> {
  const account = await rpc.getAccount(callerPublicKey);
  const contract = new Contract(CONTRACT_ID);

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  // Simulate to get the Soroban data (footprint, auth entries).
  const sim = await rpc.simulateTransaction(tx);
  if (RpcApi.isSimulationError(sim)) {
    throw new Error(`Simulation failed: ${sim.error}`);
  }

  const prepared = assembleTransaction(tx, sim).build();
  const signedXdr = await signXdr(prepared.toXDR());

  const submitted = await rpc.sendTransaction(
    TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE)
  );

  if (submitted.status === "ERROR") {
    throw new Error(
      `Submission error: ${submitted.errorResult?.toXDR("base64") ?? "unknown"}`
    );
  }

  // Poll until the transaction leaves the NOT_FOUND state.
  let response = await rpc.getTransaction(submitted.hash);
  for (let i = 0; i < 30; i++) {
    if (response.status !== RpcApi.GetTransactionStatus.NOT_FOUND) break;
    await new Promise((r) => setTimeout(r, 2000));
    response = await rpc.getTransaction(submitted.hash);
  }

  if (response.status !== RpcApi.GetTransactionStatus.SUCCESS) {
    throw new Error(`Transaction failed: ${response.status}`);
  }

  // TypeScript now knows response is GetSuccessfulTransactionResponse.
  return response.returnValue ?? xdr.ScVal.scvVoid();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function createPlan(
  callerPublicKey: string,
  params: CreatePlanParams
): Promise<bigint> {
  const result = await invokeContract(callerPublicKey, "create_plan", [
    new Address(params.learner).toScVal(),
    new Address(params.mentor).toScVal(),
    new Address(params.token).toScVal(),
    nativeToScVal(params.stakeAmount, { type: "i128" }),
    nativeToScVal(params.milestoneCount, { type: "u32" }),
    nativeToScVal(params.reviewWindowLedgers, { type: "u32" }),
    nativeToScVal(params.deadlineLedger, { type: "u32" }),
    new Address(params.forfeitRecipient).toScVal(),
  ]);
  // The contract returns u64; Long.js instances from xdr.Uint64 support .toString().
  return BigInt(result.u64().toString());
}

export async function submitMilestone(
  callerPublicKey: string,
  planId: bigint,
  index: number
): Promise<void> {
  await invokeContract(callerPublicKey, "submit_milestone", [
    nativeToScVal(planId, { type: "u64" }),
    nativeToScVal(index, { type: "u32" }),
  ]);
}

export async function verifyMilestone(
  callerPublicKey: string,
  planId: bigint,
  index: number
): Promise<void> {
  await invokeContract(callerPublicKey, "verify_milestone", [
    nativeToScVal(planId, { type: "u64" }),
    nativeToScVal(index, { type: "u32" }),
  ]);
}

export async function rejectMilestone(
  callerPublicKey: string,
  planId: bigint,
  index: number
): Promise<void> {
  await invokeContract(callerPublicKey, "reject_milestone", [
    nativeToScVal(planId, { type: "u64" }),
    nativeToScVal(index, { type: "u32" }),
  ]);
}

export async function claimUnreviewed(
  callerPublicKey: string,
  planId: bigint,
  index: number
): Promise<void> {
  await invokeContract(callerPublicKey, "claim_unreviewed", [
    nativeToScVal(planId, { type: "u64" }),
    nativeToScVal(index, { type: "u32" }),
  ]);
}

export async function forfeitMilestone(
  callerPublicKey: string,
  planId: bigint,
  index: number
): Promise<void> {
  await invokeContract(callerPublicKey, "forfeit_milestone", [
    nativeToScVal(planId, { type: "u64" }),
    nativeToScVal(index, { type: "u32" }),
  ]);
}

export async function extendPlan(
  callerPublicKey: string,
  planId: bigint
): Promise<void> {
  await invokeContract(callerPublicKey, "extend_plan", [
    nativeToScVal(planId, { type: "u64" }),
  ]);
}

export async function acceptPlan(
  callerPublicKey: string,
  planId: bigint
): Promise<void> {
  await invokeContract(callerPublicKey, "accept_plan", [
    nativeToScVal(planId, { type: "u64" }),
  ]);
}

export async function cancelPlan(
  callerPublicKey: string,
  planId: bigint
): Promise<void> {
  await invokeContract(callerPublicKey, "cancel_plan", [
    nativeToScVal(planId, { type: "u64" }),
  ]);
}

/** Read plan state — uses a read-only simulation (no signing required). */
export async function getPlan(planId: bigint): Promise<Plan> {
  const contract = new Contract(CONTRACT_ID);
  // A real Account instance is required by TransactionBuilder.
  const dummyKey = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN";
  let account: Account;
  try {
    account = await rpc.getAccount(dummyKey);
  } catch {
    // Fallback for offline/test contexts.
    account = new Account(dummyKey, "0");
  }

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call("get_plan", nativeToScVal(planId, { type: "u64" })))
    .setTimeout(30)
    .build();

  const sim = await rpc.simulateTransaction(tx);
  if (RpcApi.isSimulationError(sim)) {
    throw new Error(`Simulation failed: ${sim.error}`);
  }
  if (!RpcApi.isSimulationSuccess(sim) || !sim.result) {
    throw new Error("No result from simulation");
  }

  return scValToPlan(sim.result.retval);
}

// ---------------------------------------------------------------------------
// XDR → TypeScript deserialization helpers
// ---------------------------------------------------------------------------

/**
 * Convert an xdr.Int128Parts value to a JavaScript BigInt.
 * Int128Parts stores the value as two 64-bit halves: hi (signed) and lo (unsigned).
 * Both are Long.js instances whose .toString() gives a decimal string.
 */
function int128PartsToBigInt(parts: xdr.Int128Parts): bigint {
  // Long.js .toString() returns the correct decimal representation.
  const hi = BigInt(parts.hi().toString());
  const lo = BigInt(parts.lo().toString());
  // Reconstruct: hi is the upper 64 signed bits, lo is the lower 64 unsigned bits.
  return (hi << 64n) | lo;
}

function scValToPlan(val: xdr.ScVal): Plan {
  const map = val.map() ?? [];
  const get = (key: string): xdr.ScVal => {
    const entry = map.find((e) => e.key().sym() === key);
    if (!entry) throw new Error(`Missing field: ${key}`);
    return entry.val();
  };

  const milestonesVec = get("milestones").vec() ?? [];

  return {
    id: BigInt(get("id").u64().toString()),
    learner: Address.fromScVal(get("learner")).toString(),
    mentor: Address.fromScVal(get("mentor")).toString(),
    token: Address.fromScVal(get("token")).toString(),
    stake_amount: int128PartsToBigInt(get("stake_amount").i128()),
    milestone_count: get("milestone_count").u32(),
    deadline_ledger: get("deadline_ledger").u32(),
    review_window_ledgers: get("review_window_ledgers").u32(),
    forfeit_recipient: Address.fromScVal(get("forfeit_recipient")).toString(),
    // PlanStatus is a Soroban enum — the SCVal is a vec with one sym entry.
    status: ((): import("../types/contract").PlanStatus => {
      const sym = get("status").vec()?.[0].sym() ?? "AwaitingMentor";
      if (sym === "Completed") return "Completed";
      if (sym === "Cancelled") return "Cancelled";
      if (sym === "Active") return "Active";
      return "AwaitingMentor";
    })(),
    milestones: milestonesVec.map(scValToMilestone),
  };
}

function scValToMilestone(val: xdr.ScVal): import("../types/contract").Milestone {
  const map = val.map() ?? [];
  const get = (key: string): xdr.ScVal => {
    const entry = map.find((e) => e.key().sym() === key);
    if (!entry) throw new Error(`Missing milestone field: ${key}`);
    return entry.val();
  };
  // MilestoneStatus is a Soroban enum — SCVal vec with one sym.
  const statusSym = get("status").vec()?.[0].sym() ?? "Pending";
  return {
    status: statusSym as import("../types/contract").MilestoneStatus,
    submitted_at: get("submitted_at").u32(),
    share: int128PartsToBigInt(get("share").i128()),
  };
}
