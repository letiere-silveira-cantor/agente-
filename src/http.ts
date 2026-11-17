type Handler = (request: Request) => Response | Promise<Response>;

/** Devolve o erro como JSON legível pelo site, em vez de um "Erro 500" sem explicação. */
export function comErros(handler: Handler): Handler {
  return async (request) => {
    try {
      return await handler(request);
    } catch (e) {
      console.error(e);
      return Response.json({ erro: (e as Error).message || "Erro interno" }, { status: 500 });
    }
  };
}
