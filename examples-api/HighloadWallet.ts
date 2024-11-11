import {
    Address,
    beginCell,
    Cell,
    ContractProvider,
    internal as internal_relaxed,
    MessageRelaxed,
    OutAction,
    OutActionSendMsg,
    Sender,
    SendMode,
    storeMessageRelaxed,
    storeOutList,
    toNano
} from '@ton/core';
import { TonApiClient } from "@ton-api/client";
import { sign } from "@ton/crypto";
import { OP } from "./const";
import { HighloadQueryId } from "./HighloadQueryId";

export const TIMESTAMP_SIZE = 64;
export const TIMEOUT_SIZE = 22;

export class HighloadWallet {

    constructor(readonly address: Address, readonly client: TonApiClient) {
    }

    static connectWallet(address: Address, client: TonApiClient) {
        return new HighloadWallet(address, client);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            bounce: false,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendExternalMessage(
        secretKey: Buffer,
        opts: {
            message: MessageRelaxed | Cell,
            mode: number,
            query_id: bigint | HighloadQueryId,
            createdAt: number,
            subwalletId: number,
            timeout: number,
        }
    ) {
        let messageCell: Cell;

        if (opts.message instanceof Cell) {
            messageCell = opts.message
        } else {
            const messageBuilder = beginCell();
            messageBuilder.store(storeMessageRelaxed(opts.message))
            messageCell = messageBuilder.endCell();
        }

        const queryId =  (opts.query_id instanceof HighloadQueryId) ? opts.query_id.getQueryId() : opts.query_id;

        const messageInner = beginCell()
            .storeUint(opts.subwalletId, 32)
            .storeRef(messageCell)
            .storeUint(opts.mode, 8)
            .storeUint(queryId, 23)
            .storeUint(opts.createdAt, TIMESTAMP_SIZE)
            .storeUint(opts.timeout, TIMEOUT_SIZE)
            .endCell();

        const body = beginCell()
            .storeBuffer(sign(messageInner.hash(), secretKey))
            .storeRef(messageInner)
            .endCell()

        const message = beginCell()
            .storeUint(0b10, 2) // indicate that it is an incoming external message
            .storeUint(0, 2) // src -> addr_none
            .storeAddress(this.address)
            .storeCoins(0) // Import fee
            .storeBit(0) // We have State Init
            .storeBit(1) // We store Message Body as a reference
            .storeRef(body) // Store Message Body as a reference
            .endCell();
        
        await this.client.blockchain.sendBlockchainMessage({boc: message})

        return message.hash().toString("hex");
    }

    async sendBatch( secretKey: Buffer, messages: OutActionSendMsg[], subwallet: number, query_id: HighloadQueryId, timeout: number, createdAt?: number, value: bigint = 0n) {
        if (createdAt == undefined) {
            createdAt = Math.floor(Date.now() / 1000);
        }
        const res =  await this.sendExternalMessage(secretKey, {
            message: this.packActions(messages, value, query_id),
            mode: value > 0n ? SendMode.PAY_GAS_SEPARATELY : SendMode.CARRY_ALL_REMAINING_BALANCE,
            query_id: query_id,
            createdAt: createdAt,
            subwalletId: subwallet,
            timeout: timeout
        });
        return res
    }

    static createInternalTransferBody(opts: {
        actions: OutAction[] | Cell,
        queryId: HighloadQueryId,
    }) {
        let actionsCell: Cell;
        if (opts.actions instanceof Cell) {
            actionsCell = opts.actions;
        } else {
            if (opts.actions.length > 254) {
                throw TypeError("Max allowed action count is 254. Use packActions instead.");
            }
            const actionsBuilder = beginCell();
            storeOutList(opts.actions)(actionsBuilder);
            actionsCell = actionsBuilder.endCell();
        }
        return beginCell().storeUint(OP.InternalTransfer, 32)
            .storeUint(opts.queryId.getQueryId(), 64)
            .storeRef(actionsCell)
            .endCell();


    }

    createInternalTransfer(opts: {
        actions: OutAction[] | Cell
        queryId: HighloadQueryId,
        value: bigint
    }) {

        return internal_relaxed({
            to: this.address,
            value: opts.value,
            body: HighloadWallet.createInternalTransferBody(opts)
        });
        /*beginCell()
            .storeUint(0x10, 6)
            .storeAddress(this.address)
            .storeCoins(opts.value)
            .storeUint(0, 107)
            .storeSlice(body.asSlice())
            .endCell();
            */
    }

    packActions(messages: OutAction[], value: bigint = toNano('1'), query_id: HighloadQueryId) {
        let batch: OutAction[];
        if (messages.length > 254) {
            batch = messages.slice(0, 253);
            batch.push({
                type: 'sendMsg',
                mode: value > 0n ? SendMode.PAY_GAS_SEPARATELY : SendMode.CARRY_ALL_REMAINING_BALANCE,
                outMsg: this.packActions(messages.slice(253), value, query_id)
            });
        } else {
            batch = messages;
        }
        return this.createInternalTransfer({
            actions: batch,
            queryId: query_id,
            value
        });
    }


    async getPublicKey(): Promise<Buffer> {
        const res = (await this.client.blockchain.execGetMethodForBlockchainAccount(this.address, 'get_public_key'));
        return res.decoded;
    }

    async getSubwalletId(): Promise<number> {
        const res = (await this.client.blockchain.execGetMethodForBlockchainAccount(this.address, 'get_subwallet_id'));
        return res.decoded;
    }

    async getTimeout(): Promise<number> {
        const res = (await this.client.blockchain.execGetMethodForBlockchainAccount(this.address, 'get_timeout'));
        return res.decoded;
    }

    async getLastCleaned(): Promise<number> {
        const res = (await this.client.blockchain.execGetMethodForBlockchainAccount(this.address, 'get_last_clean_time'));
        return res.decoded;
    }
}
