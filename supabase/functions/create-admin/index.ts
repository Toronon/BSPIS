import { createClient } from "npm:@supabase/supabase-js@2";

const siteUrl = (Deno.env.get("SITE_URL") ?? "https://toronon.github.io/BSPIS").replace(/\/+$/, "");
const allowedOrigins = new Set([
    new URL(siteUrl).origin,
    "http://127.0.0.1:8765",
    "http://localhost:8765",
]);

function response(status: number, body: Record<string, string>, origin: string | null) {
    const headers = new Headers({ "Content-Type": "application/json" });
    if (origin && allowedOrigins.has(origin)) {
        headers.set("Access-Control-Allow-Origin", origin);
        headers.set("Vary", "Origin");
    }
    return new Response(JSON.stringify(body), { status, headers });
}

Deno.serve(async (request) => {
    const origin = request.headers.get("Origin");
    if (origin && !allowedOrigins.has(origin)) {
        return response(403, { error: "This website is not allowed to create admin accounts." }, null);
    }
    if (request.method === "OPTIONS") {
        const headers = new Headers({
            "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Max-Age": "86400",
        });
        if (origin) {
            headers.set("Access-Control-Allow-Origin", origin);
            headers.set("Vary", "Origin");
        }
        return new Response("ok", { headers });
    }
    if (request.method !== "POST") {
        return response(405, { error: "Method not allowed." }, origin);
    }

    const authorization = request.headers.get("Authorization");
    const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return response(401, { error: "Sign in with an LGU account first." }, origin);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
        console.error("Missing Supabase function environment variables.");
        return response(500, { error: "Account creation is not configured. Contact the system administrator." }, origin);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return response(401, { error: "Your session is invalid. Sign in again." }, origin);

    const { data: profile, error: profileError } = await supabase
        .from("admin_profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
    if (profileError) {
        console.error("Unable to verify account-creator role:", profileError.message);
        return response(500, { error: "Unable to verify LGU access. Please try again." }, origin);
    }
    if (profile?.role !== "lgu") {
        return response(403, { error: "Only an authorized LGU account can create admin accounts." }, origin);
    }

    let email: string;
    try {
        const body = await request.json();
        email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    } catch {
        return response(400, { error: "Enter a valid email address." }, origin);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
        return response(400, { error: "Enter a valid email address." }, origin);
    }

    const { data: invitation, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${siteUrl}/set-password.html`,
    });
    if (inviteError || !invitation.user) {
        console.error("Unable to invite administrator:", inviteError?.message ?? "No invited user returned.");
        return response(400, { error: "Unable to send invitation. The email may already have an account; verify it and try again." }, origin);
    }

    const { error: insertError } = await supabase.from("admin_profiles").insert({
        id: invitation.user.id,
        role: "admin",
    });
    if (insertError) {
        const { error: deleteError } = await supabase.auth.admin.deleteUser(invitation.user.id);
        if (deleteError) console.error("Could not remove an invited user after profile creation failed:", deleteError.message);
        console.error("Unable to create administrator profile:", insertError.message);
        return response(500, { error: "The invitation could not be completed. Please try again." }, origin);
    }

    return response(200, { message: "Administrator invitation sent." }, origin);
});
