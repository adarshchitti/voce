import { cookies } from "next/headers";
import { getAuthSecret, sessionCookieOptions } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const { password } = (await request.json()) as { password?: string };
    if (!password) return Response.json({ error: "Password is required" }, { status: 400 });
    if (password !== (await getAuthSecret())) return Response.json({ error: "Invalid credentials" }, { status: 401 });
    const cookieStore = await cookies();
    const options = sessionCookieOptions();
    cookieStore.set(options.name, password, options);
    return Response.json({ success: true });
  } catch {
    return Response.json({ error: "Login failed" }, { status: 400 });
  }
}
