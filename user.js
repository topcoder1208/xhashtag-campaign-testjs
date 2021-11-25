const anchor = require("@project-serum/anchor");
const { TOKEN_PROGRAM_ID, Token, AccountLayout } = require("@solana/spl-token");
const utils = require("./utils");

class User {
	constructor(a) { this.id = a; }

    async init(initialLamports, mintA, initialA, mintB, initialB) {
        this.keypair = new anchor.web3.Keypair();
        this.pubkey = this.keypair.publicKey;

        let envProvider = anchor.Provider.env();
        envProvider.commitment = 'pending';
        await utils.sendLamports(envProvider, this.pubkey, initialLamports);

        this.provider = new anchor.Provider(envProvider.connection, new anchor.Wallet(this.keypair), envProvider.opts);
        let program = anchor.workspace.XhashtagCampaignContract;
        this.program = new anchor.Program(program.idl, program.programId, this.provider);

        this.initialLamports = initialLamports;
        this.mintAObject = new Token(this.provider.connection, mintA, TOKEN_PROGRAM_ID, this.provider.wallet.payer);
        this.initialA = initialA;
        this.mintBObject = new Token(this.provider.connection, mintB, TOKEN_PROGRAM_ID, this.provider.wallet.payer);
        this.initialB = initialB;

        this.poolPubkey = null;
        this.campaignPubkey = null;
        this.campaignNonce = null;

        this.mintAPubkey = await this.mintAObject.createAssociatedTokenAccount(this.pubkey);
        if (initialA > 0) {
            await this.mintAObject.mintTo(this.mintAPubkey, envProvider.wallet.payer, [], initialA);
        }
        this.mintBPubkey = await this.mintBObject.createAssociatedTokenAccount(this.pubkey);
        if (initialB > 0) {
            await this.mintBObject.mintTo(this.mintBPubkey, envProvider.wallet.payer, [], initialB);
        }
    }

    async initializePool(poolKeypair) {
        const [
            _poolSigner,
            _nonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [poolKeypair.publicKey.toBuffer()],
            this.program.programId
        );
        let poolSigner = _poolSigner;
        let poolNonce = _nonce;

        this.poolPubkey = poolKeypair.publicKey;
        this.admin = {
            poolKeypair,
            poolSigner,
            poolNonce
        };

        await this.program.rpc.initialize(
            poolNonce,
            {
                accounts: {
                    authority: this.provider.wallet.publicKey,
                    pool: this.poolPubkey
                },
                signers: [poolKeypair],
                instructions: [
                    await this.program.account.pool.createInstruction(poolKeypair, ),
                ],
            }
        );

    }

    async createCampaign(poolPubkey, mintObject, vaultObject, depositor, data) {
        this.poolPubkey = poolPubkey;
        const [
            _poolSigner,
            _nonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [poolPubkey.toBuffer()],
            this.program.programId
        );

        const [
            _campaignPubkey, _campaignNonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [this.provider.wallet.publicKey.toBuffer(), poolPubkey.toBuffer()],
            this.program.programId
        );
        this.campaignPubkey = _campaignPubkey;
        this.campaignNonce = _campaignNonce;

        const balanceNeeded = await Token.getMinBalanceRentForExemptAccount(this.provider.connection);
        await this.program.rpc.createCampaign(
        	this.campaignNonce, 
            _nonce, 
        	data.details, 
        	data.submission_requirement,
        	data.total_submission_required,
        	data.reward_amount, {
            accounts: {
                pool: poolPubkey,
                owner: this.pubkey,
                rewardTokenDepositor: depositor,
                rewardTokenMint: mintObject.publicKey,
                rewardTokenVault: vaultObject,
                campaign: this.campaignPubkey,
                poolSigner: _poolSigner,
                systemProgram: anchor.web3.SystemProgram.programId,
                tokenProgram: TOKEN_PROGRAM_ID,
            },
        });
    }

    async setActivationCampaign(poolPubkey, activate) {
        await this.program.rpc.setActivationCampaign(
            activate, {
            accounts: {
                pool: poolPubkey,
                owner: this.pubkey,
                campaign: this.campaignPubkey,
                systemProgram: anchor.web3.SystemProgram.programId,
            },
        });
    }

    async addSubmission(poolPubkey) {
        await this.program.rpc.addSubmission({
            accounts: {
                pool: poolPubkey,
                owner: this.pubkey,
                campaign: this.campaignPubkey,
                systemProgram: anchor.web3.SystemProgram.programId,
            },
        });
    }
}

module.exports = {
    User
};
