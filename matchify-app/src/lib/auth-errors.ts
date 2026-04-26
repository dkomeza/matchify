const getResponseStatus = (error: unknown): number | null => {
  if (!error || typeof error !== "object") return null;

  const response = "response" in error ? error.response : undefined;
  if (response && typeof response === "object" && "status" in response) {
    return typeof response.status === "number" ? response.status : null;
  }

  const networkError = "networkError" in error ? error.networkError : undefined;
  if (networkError && typeof networkError === "object") {
    return getResponseStatus(networkError);
  }

  return null;
};

export const getGraphQLErrors = (error: unknown): unknown[] => {
  if (!error || typeof error !== "object" || !("graphQLErrors" in error)) {
    return [];
  }

  return Array.isArray(error.graphQLErrors) ? error.graphQLErrors : [];
};

const hasUnauthenticatedGraphQLError = (error: unknown) =>
  getGraphQLErrors(error).some((graphQLError) => {
    if (!graphQLError || typeof graphQLError !== "object") return false;

    const message =
      "message" in graphQLError ? graphQLError.message : undefined;
    if (message === "UNAUTHENTICATED") return true;

    const extensions =
      "extensions" in graphQLError ? graphQLError.extensions : undefined;
    if (
      !extensions ||
      typeof extensions !== "object" ||
      !("code" in extensions)
    )
      return false;

    return extensions.code === "UNAUTHENTICATED";
  });

export const isAuthFailure = (error: unknown): boolean =>
  getResponseStatus(error) === 401 || hasUnauthenticatedGraphQLError(error);
