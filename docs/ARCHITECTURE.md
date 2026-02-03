# Vencura Architecture Documentation

## High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                   CLIENT LAYER                                   │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐              │
│  │   Next.js App   │    │  Dynamic Labs   │    │  React Query    │              │
│  │   (App Router)  │◄──►│   SDK (Auth)    │    │  + tRPC Client  │              │
│  └────────┬────────┘    └────────┬────────┘    └────────┬────────┘              │
│           │                      │                      │                        │
│           └──────────────────────┼──────────────────────┘                        │
│                                  │ JWT Token                                     │
└──────────────────────────────────┼──────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                    API LAYER                                     │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                        tRPC Router (App Router)                          │    │
│  │  ┌──────────┐ ┌─────────────┐ ┌──────────────┐ ┌───────────────────┐    │    │
│  │  │   User   │ │   Wallet    │ │WalletAccess  │ │TransactionProposal│    │    │
│  │  │  Router  │ │   Router    │ │   Router     │ │      Router       │    │    │
│  │  └──────────┘ └─────────────┘ └──────────────┘ └───────────────────┘    │    │
│  │  ┌──────────────────┐                                                    │    │
│  │  │ Messaging Router │                                                    │    │
│  │  └──────────────────┘                                                    │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
└──────────────────────────────────┬──────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                 SERVICE LAYER                                    │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐              │
│  │   Lit Protocol  │    │   Blockchain    │    │      XMTP       │              │
│  │    Service      │    │    Service      │    │    Service      │              │
│  │  (PKP + Signing)│    │  (Viem Client)  │    │  (Messaging)    │              │
│  └────────┬────────┘    └────────┬────────┘    └────────┬────────┘              │
│           │                      │                      │                        │
│  ┌────────┴────────┐    ┌────────┴────────┐    ┌────────┴────────┐              │
│  │  Email Service  │    │  Prisma Client  │    │                 │              │
│  │    (Resend)     │    │   (SQLite DB)   │    │                 │              │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘              │
│                                                                                  │
└──────────────────────────────────┬──────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              EXTERNAL SERVICES                                   │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐              │
│  │  Lit Protocol   │    │    Ethereum     │    │   XMTP Network  │              │
│  │    Network      │    │   (Sepolia/     │    │   (Messaging)   │              │
│  │   (DatilDev)    │    │    Mainnet)     │    │                 │              │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘              │
│                                                                                  │
│  ┌─────────────────┐    ┌─────────────────┐                                     │
│  │  Etherscan API  │    │  Resend (Email) │                                     │
│  │  (Tx History)   │    │                 │                                     │
│  └─────────────────┘    └─────────────────┘                                     │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Architecture Decisions

### 1. MPC Wallet Implementation with Lit Protocol

**Decision:** Use Lit Protocol's Programmable Key Pairs (PKPs) for wallet key management instead of traditional private key storage.

**Rationale:**
- **Non-custodial by design**: Private keys are never fully reconstructed in any single location
- **Threshold cryptography**: Keys are split across Lit's decentralized network of nodes
- **Programmable access control**: Signing permissions can be enforced through Lit Actions
- **JWT-based authentication**: Users authenticate via Dynamic Labs JWT, which is verified before any signing operation

**Implementation Details:**
- Each wallet is backed by a PKP with a unique `pkpTokenId` and `pkpPublicKey`
- The `authMethodId` (keccak256 hash of user email) links user identity to PKP permissions
- Server wallet pays gas for PKP minting but cannot sign without valid user JWT
- Session signatures are generated using SIWE (Sign-In with Ethereum) protocol

### 2. TRUE NON-CUSTODIAL Authentication with Lit Actions

**Decision:** Use Lit Actions for JWT verification directly on the decentralized Lit Network, making the system truly non-custodial.

**Rationale:**
- **Decentralized verification**: JWT is verified INSIDE the Lit Action running on Lit nodes, not on our server
- **Server cannot forge signatures**: Even with full server access, an attacker cannot sign without a valid user JWT
- **Cryptographic JWT verification**: The Lit Action fetches Dynamic Labs' JWKS and verifies JWT signature using RS256

**Security Model (True Non-Custodial):**
```
User (Dynamic Labs) → JWT → Server passes to Lit → [LIT NODES verify JWT + sign] → Signature
                                                          ↑
                                               Decentralized trust boundary
```

**Lit Action Flow:**
1. Fetch Dynamic Labs JWKS (public keys) from `https://app.dynamic.xyz/api/v0/sdk/{envId}/.well-known/jwks`
2. Verify JWT signature using RS256 with the public key
3. Validate JWT claims (expiration, not-before, issued-at)
4. Compute `authMethodId` from JWT email using keccak256
5. Compare with expected `authMethodId` from the wallet
6. Only if ALL checks pass: Sign with PKP using threshold cryptography

**Configuration:**
The signing mode is controlled by `USE_LIT_ACTION_SIGNING` in `lib/lit/service.ts`:
- `true` (default): True non-custodial mode with Lit Action verification
- `false`: Hybrid mode with server-side JWT verification (less secure, faster)

### 3. Authentication Flow with Dynamic Labs

**Decision:** Use Dynamic Labs for user authentication with JWT tokens passed through to Lit Protocol.

**Rationale:**
- **Email-based onboarding**: Users can create wallets without existing crypto wallets
- **JWT verification**: JWT is verified on Lit Network nodes (not server) for true non-custodial security
- **Single identity**: User's email becomes the canonical identifier across the system

### 3. tRPC for API Layer

**Decision:** Use tRPC with React Query for type-safe API communication.

**Rationale:**
- **End-to-end type safety**: TypeScript types flow from server to client automatically
- **No code generation**: Unlike GraphQL, no build step required for types
- **React Query integration**: Built-in caching, refetching, and optimistic updates
- **SuperJSON transformer**: Supports complex types like Date, BigInt, etc.

**Router Structure:**
- `userRouter`: User profile and sync operations
- `walletRouter`: Wallet CRUD, signing, transactions
- `walletAccessRouter`: Invitation and sharing system
- `transactionProposalRouter`: Multi-sig style approval workflow
- `messagingRouter`: XMTP-based messaging

### 4. Role-Based Access Control (RBAC)

**Decision:** Implement three access roles: VIEW_ONLY, CO_SIGNER, and FULL_ACCESS.

**Role Capabilities:**

| Role | View Balance | View Transactions | Propose Tx | Sign & Send | Manage Access |
|------|--------------|-------------------|------------|-------------|---------------|
| OWNER | ✅ | ✅ | ✅ | ✅ | ✅ |
| FULL_ACCESS | ✅ | ✅ | ✅ | ✅ | ❌ |
| CO_SIGNER | ✅ | ✅ | ✅ | ❌ (requires owner approval) | ❌ |
| VIEW_ONLY | ✅ | ✅ | ❌ | ❌ | ❌ |

### 5. Transaction Proposal Workflow

**Decision:** Implement a proposal-approval workflow for CO_SIGNER role.

**Rationale:**
- Enables controlled spending without giving full signing rights
- Provides audit trail of proposed and executed transactions
- 7-day expiration prevents stale proposals

**Flow:**
```
CO_SIGNER proposes → PENDING → OWNER reviews → APPROVED/REJECTED → EXECUTED (if approved)
```

### 6. XMTP for Decentralized Messaging

**Decision:** Integrate XMTP protocol for wallet-to-wallet messaging.

**Rationale:**
- **Decentralized**: Messages are not stored on our servers
- **Wallet-native**: Messages are tied to wallet addresses
- **End-to-end encrypted**: XMTP handles encryption automatically
- **Persistent identity**: Uses PKP signing for XMTP identity

**Caching Strategy:**
- Client cache with 30-minute TTL
- Maximum 50 cached clients
- Automatic cleanup of stale clients
- Database files stored in temp directory

### 7. SQLite with Prisma

**Decision:** Use SQLite as the database with Prisma ORM.

**Rationale:**
- **Simplicity**: No separate database server required
- **Portability**: Easy local development and deployment
- **Prisma compatibility**: Full ORM support with migrations

---

## Weaknesses

### 1. ~~JWT Verification Limitations~~ (RESOLVED)

**Previous Weakness:** JWT verification was done server-side by decoding without cryptographic signature verification.

**Resolution:** Implemented true non-custodial JWT verification using Lit Actions:
- JWT is now verified INSIDE the Lit Action running on decentralized Lit nodes
- Lit Action fetches Dynamic Labs' JWKS and verifies RS256 signature
- Server cannot forge signatures even with full access
- See `lib/lit/actions/verifyJwt.ts` for implementation

**Current Security Model:**
```typescript
// JWT verified on Lit Network nodes with cryptographic signature verification
const jwksUrl = "https://app.dynamic.xyz/api/v0/sdk/" + envId + "/.well-known/jwks";
// RS256 signature verification using crypto.subtle.verify()
const isValid = await crypto.subtle.verify({ name: "RSASSA-PKCS1-v1_5" }, cryptoKey, sigBytes, signedDataBytes);
```

### 2. Single Point of Failure: Server Wallet

**Weakness:** The server's Ethereum private key (`ETHEREUM_PRIVATE_KEY`) is used to:
- Pay gas for PKP minting
- Provide session signatures for Lit Action execution

**Impact:** If the server wallet is compromised:
- Attacker STILL cannot sign without valid user JWT (verified on Lit nodes)
- But attacker could potentially drain gas funds
- Could add malicious permitted addresses to new PKPs

**Mitigation:** 
- Use hardware security modules (HSM) for key storage
- Implement key rotation procedures
- Use multi-sig for the server wallet itself

### 3. SQLite Scalability

**Weakness:** SQLite is not designed for high-concurrency write operations.

**Impact:**
- Performance degrades under heavy load
- Not suitable for horizontal scaling
- Single-file database limits deployment options

**Mitigation:** Migrate to PostgreSQL or another distributed database for production.

### 4. XMTP Client State Management

**Weakness:** XMTP clients are cached server-side with database files.

**Issues:**
- Database files can accumulate in temp directories
- Client recreation is expensive (requires PKP signing)
- "Inbox not found" errors require client refresh

**Mitigation:** 
- Implement more robust state synchronization
- Consider client-side XMTP integration for real-time messaging

### 5. Lack of Rate Limiting

**Weakness:** No rate limiting on API endpoints.

**Impact:**
- Vulnerable to brute-force attacks
- Resource exhaustion attacks
- High gas costs from spam wallet creation

**Mitigation:** Implement rate limiting middleware with Redis or similar.

### 6. Invitation Link Security

**Weakness:** Invitation IDs are CUIDs exposed in URLs.

**Impact:** While CUIDs are unique, they could be guessed or leaked.

**Mitigation:**
- Add cryptographic signature to invitation links
- Implement single-use tokens
- Add CAPTCHA for invitation acceptance

---

## Concerns

### 1. Lit Protocol Network Dependency

**Concern:** The entire signing infrastructure depends on Lit Protocol's availability.

**Considerations:**
- Lit Protocol is still relatively new (using DatilDev network)
- Network outages would prevent all signing operations
- No fallback signing mechanism exists

**Recommendation:** 
- Monitor Lit Protocol status
- Implement graceful degradation
- Consider backup signing mechanisms for critical operations

### 2. Key Recovery and Backup

**Concern:** If a user loses access to their Dynamic Labs account, wallet access is lost.

**Considerations:**
- No seed phrase or private key export
- PKPs cannot be transferred to new authentication methods easily
- Social recovery not implemented

**Recommendation:**
- Implement social recovery mechanisms
- Allow multiple auth methods per PKP
- Document recovery procedures clearly

### 3. Gas Cost Management

**Concern:** Server pays gas for PKP minting and potentially other operations.

**Considerations:**
- High gas periods could drain funds quickly
- No mechanism to recover costs from users
- Spam wallet creation could be costly

**Recommendation:**
- Implement wallet creation limits per user
- Consider gas sponsorship services (e.g., Alchemy Gas Manager)
- Add payment integration for premium features

### 4. FULL_ACCESS Role Security

**Concern:** FULL_ACCESS users can sign and send transactions without owner approval.

**Considerations:**
- Owner has no oversight of FULL_ACCESS transactions
- No spending limits or velocity checks
- Could lead to unauthorized fund movement

**Recommendation:**
- Add spending limits per role
- Implement transaction notifications
- Consider time-delay for large transactions

### 5. Cross-Chain Support

**Concern:** Current implementation only supports Ethereum mainnet/Sepolia.

**Considerations:**
- PKPs are chain-agnostic but our code is not
- Hardcoded chain IDs in transaction signing
- No ERC-20 token transfer support in UI

**Recommendation:**
- Abstract chain configuration
- Add network selection in UI
- Implement token-aware transactions

### 6. Testing in Production Environment

**Concern:** Using DatilDev network which may have different behavior than production Lit network.

**Considerations:**
- DatilDev may have different availability guarantees
- Testing gaps between dev and production Lit networks
- Rate limits may differ

**Recommendation:**
- Plan migration path to production Lit network
- Conduct thorough testing on production-like environment
- Document network-specific behaviors

---

## Technology Stack Summary

| Component | Technology | Purpose |
|-----------|------------|---------|
| Frontend | Next.js 16, React 19 | UI and routing |
| Styling | Tailwind CSS 4, Radix UI | Design system |
| API Layer | tRPC 11, React Query 5 | Type-safe API |
| Authentication | Dynamic Labs SDK | Email/wallet auth |
| Database | SQLite + Prisma 7 | Data persistence |
| Wallet Keys | Lit Protocol 7.4 | MPC key management |
| Blockchain | Viem, Ethers.js | Ethereum interactions |
| Messaging | XMTP Node SDK | Decentralized chat |
| Email | Resend | Transactional emails |
| Testing | Vitest, MSW | Unit & integration tests |
