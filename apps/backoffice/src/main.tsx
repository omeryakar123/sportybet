import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "./index.css";
import { getToken } from "./api";
import Layout from "./Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Players from "./pages/Players";
import PlayerDetail from "./pages/PlayerDetail";
import Bonuses from "./pages/Bonuses";
import PromoCodes from "./pages/PromoCodes";
import SportsBets from "./pages/SportsBets";
import { CmsBanners, CmsPromotions, CmsCss } from "./pages/Cms";

const Private = ({ children }: { children: React.ReactNode }) => (getToken() ? <>{children}</> : <Navigate to="/login" replace />);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Private><Layout /></Private>}>
        <Route index element={<Dashboard />} />
        <Route path="players" element={<Players />} />
        <Route path="players/:id" element={<PlayerDetail />} />
        <Route path="bets" element={<SportsBets />} />
        <Route path="bonuses" element={<Bonuses />} />
        <Route path="promo-codes" element={<PromoCodes />} />
        <Route path="cms/banners" element={<CmsBanners />} />
        <Route path="cms/promotions" element={<CmsPromotions />} />
        <Route path="cms/css" element={<CmsCss />} />
      </Route>
    </Routes>
  </BrowserRouter>,
);
