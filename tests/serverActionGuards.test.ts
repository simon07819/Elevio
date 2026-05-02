import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();
const actions = readFileSync(join(root, "lib/actions.ts"), "utf8");
const schema = readFileSync(join(root, "supabase/schema.sql"), "utf8");
const usersTighten = readFileSync(join(root, "supabase/users-rls-tighten.sql"), "utf8");
const landingRpc = readFileSync(join(root, "supabase/passenger-landing-rpc.sql"), "utf8");

test("B2: updateRequestStatus n'assigne un elevator_id que si la demande est encore non assignee (pickup atomique)", () => {
  // Le nouveau code utilise REQUESTS_OPEN_BEFORE_BOARDING + .is("elevator_id", null) dans la
  // clause WHERE de l'UPDATE pour bloquer la double-attribution multi-operateurs.
  assert.match(actions, /REQUESTS_OPEN_BEFORE_BOARDING\s*:\s*RequestStatus\[\]/);
  assert.match(actions, /\.is\("elevator_id",\s*null\)\s*\n\s*\.in\("status",\s*REQUESTS_OPEN_BEFORE_BOARDING\)/);
  assert.match(actions, /Demande deja prise par un autre operateur/);
});

test("B3: updateProject filtre par owner_id", () => {
  // Les mutations admin ajoutent un check applicatif owner_id (defense-in-depth) en plus de RLS.
  const updateProjectBlock = actions.match(/export async function updateProject[\s\S]+?\n\}\n/);
  assert.ok(updateProjectBlock, "updateProject doit exister");
  assert.match(updateProjectBlock![0], /\.eq\("id",\s*projectId\)\s*\n\s*\.eq\("owner_id",\s*user\.id\)/);
});

test("B3: archiveProject filtre par owner_id", () => {
  const archiveBlock = actions.match(/export async function archiveProject[\s\S]+?\n\}\n/);
  assert.ok(archiveBlock, "archiveProject doit exister");
  assert.match(archiveBlock![0], /\.eq\("id",\s*projectId\)\s*\n\s*\.eq\("owner_id",\s*user\.id\)/);
});

test("B3: deleteProject filtre par owner_id", () => {
  const deleteBlock = actions.match(/export async function deleteProject[\s\S]+?\n\}\n/);
  assert.ok(deleteBlock, "deleteProject doit exister");
  assert.match(deleteBlock![0], /\.eq\("id",\s*projectId\)\s*\n\s*\.eq\("owner_id",\s*user\.id\)/);
});

test("B4: la policy users n'expose plus les rangees project_id NULL aux non-superadmins", () => {
  // schema.sql canonique
  assert.match(
    schema,
    /create policy "admins read users" on users\s*\nfor select using \(\s*\n\s*\(project_id is not null and is_project_member\(project_id\)\)\s*\n\s*or is_superadmin\(\)\s*\n\)/,
  );
  // Le fichier de migration idempotent recree les memes policies resserrees
  assert.match(usersTighten, /drop policy if exists "admins read users" on users/);
  assert.match(usersTighten, /\(project_id is not null and is_project_member\(project_id\)\)/);
});

test("B1: RPC passenger_landing existe et est SECURITY DEFINER", () => {
  assert.match(landingRpc, /create or replace function public\.passenger_landing\(p_floor_token text\)/);
  assert.match(landingRpc, /security definer/);
  assert.match(landingRpc, /grant execute on function public\.passenger_landing\(text\) to anon/);
});

test("B1: getPublicRequestContext tente la RPC avant la query directe", () => {
  const publicProject = readFileSync(join(root, "lib/publicProject.ts"), "utf8");
  assert.match(publicProject, /supabase\.rpc\("passenger_landing"/);
  assert.match(publicProject, /fetchPassengerLanding/);
  // fallback legacy preserve
  assert.match(publicProject, /from\("projects"\)\s*\.select\(PUBLIC_PROJECT_SELECT_WITH_CAPACITY\)/);
});

test("B1: /api/floor-code tente la RPC passenger_floor_by_access_code en priorite", () => {
  const route = readFileSync(join(root, "app/api/floor-code/route.ts"), "utf8");
  assert.match(route, /supabase\.rpc\("passenger_floor_by_access_code"/);
});
