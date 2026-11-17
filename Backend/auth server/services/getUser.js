export function getUser(cookies) {
  const fake_db = {
    cookie1234: {
      id: 1243,
      name: "Muhammad",
      given_name: "ben yahya",
      email: "muhammadBenYahya@proton.me",
      role: "admin",
    },
    cookie2134: {
      id: 2143,
      name: "salah",
      given_name: "salah",
      email: "salahsalah@proton.me",
      role: "admin",
    },
  };
  const id = cookies['user_id'];
  return fake_db[id];
}
