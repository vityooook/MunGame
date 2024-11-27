import { toNano } from '@ton/core';
import { HighloadWalletV3 } from '../wrappers/HighloadWalletV3';
import { compile, NetworkProvider } from '@ton/blueprint';
import { getSecureRandomBytes, KeyPair, keyPairFromSeed, keyPairFromSecretKey, mnemonicNew, mnemonicToPrivateKey, mnemonicToHDSeed } from "@ton/crypto";

export async function run(provider: NetworkProvider) {

    const seed = await getSecureRandomBytes(32);

    const keyPair = keyPairFromSeed(seed);
    
    const secretKeyHex = keyPair.secretKey.toString('hex');
    const publicKeyHex = keyPair.publicKey.toString('hex');

    console.log("Секретный ключ:", secretKeyHex);
    console.log("Публичный ключ:", publicKeyHex);
    
    const restoredKeyPair = keyPairFromSecretKey(Buffer.from(secretKeyHex, 'hex'));

    const highloadWallet = provider.open(HighloadWalletV3.createFromConfig({
        publicKey: keyPair.publicKey,
        subwalletId: 0,
        timeout: 12 * 60 * 60, // 12 hours
    }, await compile('HighloadWallet')));

    await highloadWallet.sendDeploy(provider.sender(), toNano('2'));

    await provider.waitForDeploy(highloadWallet.address);
}
