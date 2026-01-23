import { router } from "../init";
import { userRouter } from "./user";
import { walletRouter } from "./wallet";
import { walletAccessRouter } from "./walletAccess";
import { messagingRouter } from "./messaging";
import { transactionProposalRouter } from "./transactionProposal";

export const appRouter = router({
  user: userRouter,
  wallet: walletRouter,
  walletAccess: walletAccessRouter,
  messaging: messagingRouter,
  transactionProposal: transactionProposalRouter,
});

export type AppRouter = typeof appRouter;
