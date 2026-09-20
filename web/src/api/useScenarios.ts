import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import { errorDetail } from "./errorDetail";
import { useAuth } from "../auth/AuthContext";
import type { components } from "./schema";

export type ScenarioParams = components["schemas"]["ScenarioParams"];
export type ScenarioOut = components["schemas"]["ScenarioOut"];

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
    queryFn: async () => {
      const { data, error } = await api.GET("/api/scenarios");
      if (error) throw new Error(errorDetail(error, "failed to load scenarios"));
      return data;
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: key });

  const save = useMutation({
    mutationFn: async ({ name, params }: { name: string; params: ScenarioParams }) => {
      const { data, error } = await api.POST("/api/scenarios", { body: { name, params } });
      if (error) throw new Error(errorDetail(error, "failed to save scenario"));
      return data;
    },
    onSuccess: invalidate,
  });

  const rename = useMutation({
    mutationFn: async ({ id, name }: { id: number; name: string }) => {
      const { data, error } = await api.PUT("/api/scenarios/{scenario_id}", {
        params: { path: { scenario_id: id } },
        body: { name },
      });
      if (error) throw new Error(errorDetail(error, "failed to rename scenario"));
      return data;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await api.DELETE("/api/scenarios/{scenario_id}", {
        params: { path: { scenario_id: id } },
      });
      if (error) throw new Error(errorDetail(error, "failed to delete scenario"));
    },
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
