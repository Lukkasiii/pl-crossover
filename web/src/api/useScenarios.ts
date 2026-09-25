import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthContext";
import { authBackend, type ScenarioOut, type ScenarioParams } from "../auth/backend";

export type { ScenarioOut, ScenarioParams } from "../auth/backend";

/**
 * Scoped by user id (not just "scenarios") so logging out and a different
 * account logging back in never renders the previous account's cached list
 * for the instant before the query refetches.
 */
function scenariosKey(userId: number | null) {
  return ["scenarios", userId] as const;
}

export function useScenarios() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const key = scenariosKey(user?.id ?? null);

  const query = useQuery<ScenarioOut[]>({
    queryKey: key,
    enabled: user !== null,
    queryFn: () => authBackend.listScenarios(),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: key });

  const save = useMutation({
    mutationFn: ({ name, params }: { name: string; params: ScenarioParams }) => authBackend.createScenario(name, params),
    onSuccess: invalidate,
  });

  const rename = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => authBackend.renameScenario(id, name),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: number) => authBackend.deleteScenario(id),
    onSuccess: invalidate,
  });

  return {
    scenarios: query.data ?? [],
    isLoading: user !== null && query.isLoading,
    error: query.error,
    save,
    rename,
    remove,
  };
}
