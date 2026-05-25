export const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA2qWnfWpM5RTyfc3dpKT2yoxtphvq2kinjHkwyFageQuZ8bMNyCd1Pq1W9iNLK5zkQ6ETe0YxvcedR93SyfjSJHy5hyvAjOQcUxFzv+EiPvM/WWN+Q75z+nC8HoiXxoQ8NlnplqnM+WQoKgsNLGMOeMVjWCU0yX6cXK7NvS9kFhlpaw+TH5E8ADlCbQ1FxujfNsMChC9WK4+3pXGuBkABNhMbZCxe3QcgiSwGPxrF6/OQhqLs1PLRFA1/KN6asFlL2XFzbjDtNXGOFqPeIHDBClI4mlc6j/Vz3DU62h5U4DGIfwSD7A+K+J4HZD0dxnt762K2xXHhJJuk4eX5UpH7VwIDAQAB
-----END PUBLIC KEY-----`;

export const LOGIN_URL = "http://www.pluckier.co.uk/login?to=github";

/**
 * Extracts a cookie value by name.
 */
export const getCookie = (name) => {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
};
