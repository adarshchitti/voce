export async function POST(request: Request) {
  try {
    void request;
    return Response.json({ error: "Password auth disabled. Use magic link sign-in." }, { status: 410 });
  } catch {
    return Response.json({ error: "Login failed" }, { status: 400 });
  }
}
