import User from "../models/User";
import fetch from "node-fetch";
import bcrypt from "bcrypt";
import axios from "axios";

export const getJoin = (req, res) => res.render("join", { pageTitle: "Join" });
export const postJoin = async (req, res) => {
  const { name, username, email, password, password2, location } = req.body;
  const pageTitle = "Join";
  if (password !== password2) {
    return res.status(400).render("join", {
      pageTitle,
      errorMessage: "Password confirmation does not match.",
    });
  }
  const exists = await User.exists({ $or: [{ username }, { email }] });
  if (exists) {
    return res.status(400).render("join", {
      pageTitle,
      errorMessage: "This username/email is already taken.",
    });
  }
  try {
    await User.create({
      name,
      username,
      email,
      password,
      location,
    });
    return res.redirect("/login");
  } catch (error) {
    return res.status(400).render("join", {
      pageTitle: "Upload Video",
      errorMessage: error._message,
    });
  }
};
export const getLogin = (req, res) =>
  res.render("login", { pageTitle: "Login" });

export const postLogin = async (req, res) => {
  const { username, password } = req.body;
  const pageTitle = "Login";
  const user = await User.findOne({ username, socialOnly: false });
  if (!user) {
    return res.status(400).render("login", {
      pageTitle,
      errorMessage: "An account with this username does not exists.",
    });
  }
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) {
    return res.status(400).render("login", {
      pageTitle,
      errorMessage: "Wrong password",
    });
  }
  req.session.loggedIn = true;
  req.session.user = user;
  return res.redirect("/");
};

export const startGithubLogin = (req, res) => {
  const baseUrl = "https://github.com/login/oauth/authorize";
  const config = {
    client_id: process.env.GH_CLIENT,
    allow_signup: false,
    scope: "read:user user:email",
  };
  const params = new URLSearchParams(config).toString();
  const finalUrl = `${baseUrl}?${params}`;
  return res.redirect(finalUrl);
};

export const finishGithubLogin = async (req, res) => {
  const baseUrl = "https://github.com/login/oauth/access_token";
  const config = {
    client_id: process.env.GH_CLIENT,
    client_secret: process.env.GH_SECRET,
    code: req.query.code,
  };
  const params = new URLSearchParams(config).toString();
  const finalUrl = `${baseUrl}?${params}`;
  const tokenRequest = await (
    await fetch(finalUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
    })
  ).json();
  if ("access_token" in tokenRequest) {
    const { access_token } = tokenRequest;
    const apiUrl = "https://api.github.com";
    const userData = await (
      await fetch(`${apiUrl}/user`, {
        headers: {
          Authorization: `token ${access_token}`,
        },
      })
    ).json();
    const emailData = await (
      await fetch(`${apiUrl}/user/emails`, {
        headers: {
          Authorization: `token ${access_token}`,
        },
      })
    ).json();
    const emailObj = emailData.find(
      (email) => email.primary === true && email.verified === true
    );
    if (!emailObj) {
      // set notification
      return res.redirect("/login");
    }
    let user = await User.findOne({ email: emailObj.email });
    if (!user) {
      user = await User.create({
        avatarUrl: userData.avatar_url,
        name: userData.name,
        username: userData.login,
        email: emailObj.email,
        password: "",
        socialOnly: true,
        location: userData.location,
      });
    }
    req.session.loggedIn = true;
    req.session.user = user;
    return res.redirect("/");
  } else {
    return res.redirect("/login");
  }
};
// ????????? ?????? ?????? uri

// ??????????????? uri
const REST_API_KEY = "1cbd75064aeeece9584e750dee323a1d";
const REDIRECT_URI = "http://localhost:4000/users/kakao/permit";
const REDIRECT_URIp = "https://wooktube.herokuapp.com/users/kakao/permit";

// ????????? ????????? ??????
// GET http://localhost:4000/users/kakao/start => ????????? ????????? => ?????? ?????????
// GET https://kauth.kakao.com/oauth/authorize => ???????????? ?????? => ????????? ?????? => ???????????????
// GET http://localhost:4000/users/kakao/permit => ???????????? ?????? => ????????? ???
// POST https://kauth.kakao.com/oauth/token => ?????????, ???????????? ?????? ??????
// POST https://kapi.kakao.com/v2/user/me => ?????? ?????? ??????

export const startKakaoLogin = (req, res) => {
  const baseUrl = "https://kauth.kakao.com/oauth/authorize";
  const config = {
    client_id: REST_API_KEY,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: ["profile", "account_email"],
  };
  const params = new URLSearchParams(config).toString();
  const finalUrl = `${baseUrl}?${params}`;
  // ????????? ?????? ????????? ???????????? ?????? response
  return res.redirect(finalUrl);
};

export const getTokenKakaoLogin = async (req, res) => {
  // ????????? ?????? ??????
  const { code } = req.query;
  // ?????? ????????? ????????? ??????(??????), ???????????? ??????(2???~1?????????) ????????????
  const baseUrl = "https://kauth.kakao.com/oauth/token";
  const config = {
    grant_type: "authorization_code",
    client_id: REST_API_KEY,
    redirect_uri: REDIRECT_URI,
    code: code,
  };
  const params = new URLSearchParams(config).toString();
  const finalUrl = `${baseUrl}?${params}`;
  const tokenRequest = await (
    await fetch(finalUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded;charset=utf-8",
      },
    })
  ).json();
  if ("access_token" in tokenRequest) {
    const { access_token } = tokenRequest;
    // ???????????? ????????? ???????????? ????????? ?????? ????????????
    const getUserUrl = "https://kapi.kakao.com/v2/user/me";
    const userData = await (
      await fetch(getUserUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      })
    ).json();
    // ???????????? ??????????????? ???????????????????
    const valid_email = userData.kakao_account.is_email_valid;
    const verified_email = userData.kakao_account.is_email_verified;
    if (!valid_email && !verified_email) {
      // ???????????? ?????? ??????????????????, ????????? ???????????? ???????????? ????????? ?????????(?????????????????? ??????)
      return res.redirect("/login");
    }
    const { thumbnail_image, nickname } = userData.properties;
    const { email } = userData.kakao_account;

    let user = await User.findOneAndUpdate(
      { email: email },
      {
        avatarUrl: thumbnail_image,
        name: nickname,
        username: nickname,
        email: email,
        password: "",
        socialOnly: true,
        location: "",
      }
    );
    // if (!user) {
    //   user = await User.create({
    //     avatarUrl: thumbnail_image,
    //     name: nickname,
    //     username: nickname,
    //     email: email,
    //     password: "",
    //     socialOnly: true,
    //     location: "",
    //   });
    // }
    req.session.loggedIn = true;
    req.session.user = user;
    return res.redirect("/");
  } else {
    return res.redirect("/login");
  }
};

// ????????????
export const logout = (req, res) => {
  req.session.destroy();
  // req.flash("info", "Bye Bye");
  return res.redirect("/");
};
export const getEdit = async (req, res) => {
  let user = await User.findOne({ email: req.session.user.email });
  return res.render("edit-profile", { pageTitle: "Edit Profile", user });
};
export const postEdit = async (req, res) => {
  const {
    session: {
      user: { _id, avatarUrl },
    },
    body: { name, email, username, location },
    file,
  } = req;
  const isHeroku = process.env.NODE_ENV === "production";
  const updatedUser = await User.findByIdAndUpdate(
    _id,
    {
      avatarUrl: file ? (isHeroku ? file.location : file.path) : avatarUrl,
      name,
      email,
      username,
      location,
    },
    { new: true }
  );
  req.session.user = updatedUser;
  return res.redirect("/users/edit");
};

export const getChangePassword = (req, res) => {
  if (req.session.user.socialOnly === true) {
    req.flash("error", "Can't change password.");
    return res.redirect("/");
  }
  return res.render("users/change-password", { pageTitle: "Change Password" });
};
export const postChangePassword = async (req, res) => {
  const {
    session: {
      user: { _id },
    },
    body: { oldPassword, newPassword, newPasswordConfirmation },
  } = req;
  const user = await User.findById(_id);
  const ok = await bcrypt.compare(oldPassword, user.password);
  if (!ok) {
    return res.status(400).render("users/change-password", {
      pageTitle: "Change Password",
      errorMessage: "The current password is incorrect",
    });
  }
  if (newPassword !== newPasswordConfirmation) {
    return res.status(400).render("users/change-password", {
      pageTitle: "Change Password",
      errorMessage: "The password does not match the confirmation",
    });
  }
  user.password = newPassword;
  await user.save();
  req.flash("info", "Password updated");
  return res.redirect("/users/logout");
};

export const see = async (req, res) => {
  const { id } = req.params;
  const user = await User.findById(id).populate({
    path: "videos",
    populate: {
      path: "owner",
      model: "User",
    },
  });
  if (!user) {
    return res.status(404).render("404", { pageTitle: "User not found." });
  }
  return res.render("users/profile", {
    pageTitle: user.name,
    user,
  });
};
