import assert from "assert";
import anchor from '@project-serum/anchor';
import idl from './idl.json';

import * as utils from "./utils";
import { User } from "./user";
import {
  useWallet,
  useConnection
} from '@solana/wallet-adapter-react';

const { connection } = useConnection();
const wallet = useWallet();

const opts = {
  preflightCommitment: "processed"
}
let provider = new anchor.Provider(
  connection, wallet, opts.preflightCommitment,
);

const programID = new anchor.web3.PublicKey(idl.metadata.address);
const program = new anchor.Program(idl, programID, provider);

describe('xhashtag-campagin-contract', () => {
  let mintA, mintB;
  let users;
  let poolOwner;
  let poolKeypair = anchor.web3.Keypair.generate();

  it("Initialize mints", async () => {
    console.log("Program ID: ", program.programId.toString());
    console.log("Wallet: ", provider.wallet.publicKey.toString());

    mintA = await utils.createMint(provider, 9);

    mintB = await utils.createMint(provider, 9);

  });

  it("Initialize users", async () => {
    users = [1, 2, 3, 4, 5].map(a => new User(a));
    await Promise.all(
      users.map(a => a.init(10_000_000_000, mintA.publicKey, 100_000_000_000, mintB.publicKey, 0))
    );
  })

  it("Initialize pool owner", async () => {
    poolOwner = new User(1000);
    await poolOwner.init(10_000_000_000, mintA.publicKey, 100_000_000_000, mintB.publicKey, 0);
  })

  //to track cost to create pool, and compare to refund at teardown
  let costInLamports;

  it("Creates a pool", async () => {
    //track cost of creating a pool
    let startLamports = (await provider.connection.getBalance(poolOwner.pubkey));

    await poolOwner.initializePool(poolKeypair);

    // //validate cost
    let endLamports = (await provider.connection.getBalance(poolOwner.pubkey));
    costInLamports = startLamports - endLamports;

    console.log("Cost of creating a pool", (costInLamports / 1_000_000_000));
  });

  it("Creates a campaign", async () => {

    let mintAVault = await users[0].mintAObject.createAccount(poolOwner.admin.poolSigner);
    users[0].mintAVault = mintAVault;
    const data = {
      details: ['tg'],
      submission_requirement: ['link'],
      total_submission_required: new anchor.BN(10),
      reward_amount: new anchor.BN(10_000_000_000)
    }

    await users[0].createCampaign(poolOwner.poolPubkey, users[0].mintAObject, mintAVault, users[0].mintAPubkey, data);
  })

  it("Try create duplicate campaign with same user", async () => {
    let mintBVault = await users[0].mintBObject.createAccount(poolOwner.admin.poolSigner);
    try {
      const data = {
        details: ['tg'],
        submission_requirement: ['link'],
        total_submission_required: new anchor.BN(10),
        reward_amount: new anchor.BN(10_000_000_000)
      }

      await users[0].createCampaign(poolOwner.poolPubkey, users[0].mintAObject, users[0].mintAVault, users[0].mintAPubkey, data);
      assert.fail("did not fail on user duplicate campaign");
    } catch (e) {

    }
  })

  it("Try create campaign with less amount of reward token", async () => {
    let mintBVault = await users[0].mintBObject.createAccount(poolOwner.admin.poolSigner);
    try {
      await users[0].createCampaign(poolOwner.poolPubkey, users[0].mintBObject, mintBVault, users[0].mintBPubkey);
      assert.fail("did not fail on user reward token less");
    } catch (e) {

    }
  })

  it("fetching data", async () => {
    const [
      _campaignPubkey, _campaignNonce,
    ] = await anchor.web3.PublicKey.findProgramAddress(
      [users[0].pubkey.toBuffer(), poolOwner.poolPubkey.toBuffer()],
      program.programId
    );

    const campaign = await program.account.campaign.fetch(_campaignPubkey);
    assert.equal(campaign.isActive, false)
    assert.equal(campaign.details.length, 1)
    assert.equal(campaign.details[0], 'tg')
    assert.equal(campaign.submissionRequirement.length, 1)
    assert.equal(campaign.submissionRequirement[0], 'link')
    assert.equal(campaign.totalSubmissionRequired.toNumber(), 10)
  })

  it("update activate for campaign", async () => {
    await users[0].setActivationCampaign(poolOwner.poolPubkey, true);
    const campaign = await program.account.campaign.fetch(users[0].campaignPubkey);
    assert.equal(campaign.isActive, true)

    await users[0].setActivationCampaign(poolOwner.poolPubkey, false);
    const campaign2 = await program.account.campaign.fetch(users[0].campaignPubkey);
    assert.equal(campaign2.isActive, false)
  })

  it("add submission", async () => {
    await users[0].addSubmission(poolOwner.poolPubkey);
    const campaign = await program.account.campaign.fetch(users[0].campaignPubkey);
    assert.equal(campaign.currentSubmission.toNumber(), 1)
  })

  it("get total campaign count", async () => {
    const pool = await program.account.pool.fetch(poolOwner.poolPubkey);
    assert.equal(pool.campaignCount, 1)
  })
});
