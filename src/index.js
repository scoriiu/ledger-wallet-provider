const Ledger3 = require('./vendor/ledger3.js');
const LedgerEth = require('./vendor/ledger-eth.js');
const Tx = require('ethereumjs-tx');

/**
 *  Ledger wallet
 *
 *  @see https://github.com/MetaMask/provider-engine
 *  @see https://github.com/ethereum/wiki/wiki/JavaScript-API
 *
 *  Paths:
 *  Minimum Nano Ledger S accepts are:
 *
 *   * 44'/60'
 *   * 44'/61'
 *
 *  MyEtherWallet.com by default uses the range
 *
 *   * 44'/60'/0'/n
 *
 *  Note: no hardend derivation on the `n`
 *
 *  BIP44/EIP84 specificies:
 *
 *  * m / purpose' / coin_type' / account' / change / address_index
 *
 *  https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki
 *  https://github.com/satoshilabs/slips/blob/master/slip-0044.md
 *
 *  Implementations:
 *  https://github.com/MetaMask/metamask-plugin/blob/master/app/scripts/keyrings/hd.js
 *
 */
class LedgerWalletSubprovider {
    constructor() {
        this.path = "44'/60'/0'/0";
        this.accounts = undefined;
        this.scrambleKey = "w0w"; // Hardcoded key for the Ledger Nano S
        this.ledger3 = new Ledger3(this.scrambleKey);
        this.ledger = new LedgerEth(this.ledger3);
        this.getAccounts = this.getAccounts.bind(this);
        this.signTransaction = this.signTransaction.bind(this);
    }

    getAppConfig(cb) {
        this.ledger.getAppConfiguration((config)=> {
            // TODO: Need at least version 1.0.4 for EIP155 signing
            cb(config);
        });
    }

    getAccounts(cb) {
        var self = this;
        if (this.accounts !== undefined) {
            cb(undefined, this.accounts);
            return;
        }

        const display = false;  // Ask for on-device confirmation
        const chainCode = false; // Include the chain code
        this.ledger.getAddress(this.path, (result, error)=> {
            if (typeof result === undefined) {
                cb(error, result);
            }
            self.accounts = [result.address.toLowerCase()];
            cb(error, self.accounts);
        }, display, chainCode);
    }

    signTransaction(txData, callback) {
        var self = this;

        // Encode using ethereumjs-tx
        var tx = new Tx(txData);

        // Fetch the chain id
        web3.version.getNetwork((error, chain_id)=> {
            if (error) callback(error);

            // Force chain_id to int
            chain_id = 0 | chain_id;

            // Set the EIP155 bits
            tx.raw[6] = Buffer.from([chain_id]); // v
            tx.raw[7] = Buffer.from([]);         // r
            tx.raw[8] = Buffer.from([]);         // s

            // Encode as hex-rlp for Ledger
            const hex = tx.serialize().toString('hex');

            // Pass to ledger for signing
            self.ledger.signTransaction(self.path, hex, (result, error)=> {
                if (error) callback(error);

                // Store signature in transaction
                tx.v = new Buffer(result.v, 'hex');
                tx.r = new Buffer(result.r, 'hex');
                tx.s = new Buffer(result.s, 'hex');

                // EIP155: v should be chain_id * 2 + {35, 36}
                const signed_chain_id = Math.floor((tx.v[0] - 35) / 2);
                if (signed_chain_id !== chain_id) {
                    callback('Invalid signature received. Please update your Ledger Nano S.');
                }

                // Return the signed raw transaction
                var rawTx = '0x' + tx.serialize().toString('hex');
                callback(undefined, rawTx);
            })
        })
    }
}

module.exports = LedgerWalletSubprovider;