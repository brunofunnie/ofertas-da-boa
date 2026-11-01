// Aviso de um provider: a fonte respondeu, mas não há ofertas vigentes. Vira o estado amarelo no backoffice.
// Erros comuns (fetch, HTTP, timeout, sessão) continuam vermelhos.
export const warning = message => Object.assign(Error(message), {warning:true});
