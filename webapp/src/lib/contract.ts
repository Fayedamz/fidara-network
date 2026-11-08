// ---------------------------------------------------------------------------
// Contract client helpers.
//
// Wraps @stellar/stellar-sdk contract interactions. All calls produce a
// transaction that must be signed by the user's wallet (Freighter) and
// submitted to the Stellar Testnet RPC.
// ---------------------------------------------------------------------------

import {
  Contract,
  Networks,
  TransactionBuilder,
  nativeToScVal,
  Address,
  xdr,
  BASE_FEE,
  SorobanRpc,
} from "@stellar/stellar-sdk";

import type { CreatePlanParams, Plan } from "../types/contract";
import { signXdr } from "./wallet";

export const TESTNET_RPC = "https://soroban-testnet.stellar.org";
export const NETWORK_PASSPHRASE = Networks.TESTNET;

// Replace with the deployed contract address after deployment.
export const CONTRACT_ID: string =
  import.meta.env.VITE_CONTRACT_ID ?? "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4";

const rpc = new SorobanRpc.Server(TESTNET_RPC);

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
  if (SorobanRpc.Api.isSimulationError(sim)) {
    throw new Error(`Simulation failed: ${sim.error}`);
  }

  const prepared = SorobanRpc.assembleTransaction(tx, sim).build();
  const signedXdr = await signXdr(prepared.toXDR());

  const submitted = await rpc.sendTransaction(
    TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE)
  );

  if (submitted.status === "ERROR") {
    throw new Error(`Submission error: ${submitted.errorResult?.toXDR()}`);
  }

  // Poll for completion.
  let response = await rpc.getTransaction(submitted.hash);
  for (let i = 0; i < 30; i++) {
    if (response.status !== SorobanRpc.Api.GetTransactionStatus.NOT_FOUND) break;
    await new Promise((r) => setTimeout(r, 2000));
    response = await rpc.getTransaction(submitted.hash);
  }

  if (response.status !== SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
    throw new Error(`Transaction failed: ${response.status}`);
  }

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

/** Read plan state — uses a read-only simulation (no signing needed). */
export async function getPlan(planId: bigint): Promise<Plan> {
  const contract = new Contract(CONTRACT_ID);
  // Use a dummy account for read-only simulation.
  const dummyKey = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN";
  const account = await rpc.getAccount(dummyKey).catch(() => ({
    accountId: () => dummyKey,
    sequence: () => "0",
    incrementSequenceNumber: () => {},
  }));

  const tx = new TransactionBuilder(account as Parameters<typeof TransactionBuilder>[0], {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call("get_plan", nativeToScVal(planId, { type: "u64" })))
    .setTimeout(30)
    .build();

  const sim = await rpc.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(sim)) {
    throw new Error(`Simulation failed: ${sim.error}`);
  }
  if (!SorobanRpc.Api.isSimulationSuccess(sim) || !sim.result) {
    throw new Error("No result from simulation");
  }

  return scValToPlan(sim.result.retval);
}

// ---------------------------------------------------------------------------
// XDR → TypeScript deserialization
// ---------------------------------------------------------------------------

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
    stake_amount: BigInt(get("stake_amount").i128().toString()),
    milestone_count: get("milestone_count").u32(),
    deadline_ledger: get("deadline_ledger").u32(),
    review_window_ledgers: get("review_window_ledgers").u32(),
    forfeit_recipient: Address.fromScVal(get("forfeit_recipient")).toString(),
    status: get("status").vec()?.[0].sym() === "Completed" ? "Completed" : "Active",
    milestones: milestonesVec.map(scValToMilestone),
  };
}

function scValToMilestone(val: xdr.ScVal) {
  const map = val.map() ?? [];
  const get = (key: string): xdr.ScVal => {
    const entry = map.find((e) => e.key().sym() === key);
    if (!entry) throw new Error(`Missing milestone field: ${key}`);
    return entry.val();
  };
  const statusSym = get("status").vec()?.[0].sym() ?? "Pending";
  return {
    status: statusSym as import("../types/contract").MilestoneStatus,
    submitted_at: get("submitted_at").u32(),
    share: BigInt(get("share").i128().toString()),
  };
}
