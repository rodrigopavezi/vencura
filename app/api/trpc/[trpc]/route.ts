import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@/server/trpc/routers/_app";
import { createTRPCContext } from "@/server/trpc/init";
import { prisma } from "@/lib/prisma";

/**
 * Extract JWT token from Authorization header
 */
function getJwtFromRequest(req: Request): string | null {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.substring(7);
}

/**
 * Extract user info from JWT and find/create user in database
 */
async function getUserFromRequest(req: Request) {
  try {
    const token = getJwtFromRequest(req);
    if (!token) {
      return null;
    }
    
    // Decode the JWT to get user info
    // In production, you should verify the JWT with Dynamic's public key
    const parts = token.split(".");
    if (parts.length !== 3) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());
    
    const email = payload.email || payload.verified_credentials?.[0]?.address;
    if (!email) {
      return null;
    }

    // Find or create user in database
    let user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name: payload.first_name 
            ? `${payload.first_name} ${payload.last_name || ""}`.trim()
            : null,
        },
      });
    }

    return user;
  } catch (error) {
    console.error("Error extracting user from request:", error);
    return null;
  }
}

const handler = async (req: Request) => {
  const jwt = getJwtFromRequest(req);
  const user = await getUserFromRequest(req);
  
  // Debug logging (visible in Vercel logs)
  if (!jwt) {
    console.log("[tRPC] No JWT token in request");
  } else if (!user) {
    console.log("[tRPC] JWT present but user extraction failed");
  }

  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createTRPCContext({ user, jwt }),
  });
};

export { handler as GET, handler as POST };
