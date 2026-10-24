import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import "./index.css";
import { StoreProvider } from "./lib";
import Layout from "./Layout";
import Home from "./Home";
import Sport from "./Sport";
import { PredictionsPage, PredictionDetail, Leaderboard } from "./predictions";
import { AccountLayout, Profile, MyPredictions, Transactions, MyCoupons, MyBonuses, Security } from "./Account";
import { Deposit, Withdraw } from "./Wallet";
import { Promotions, PromotionDetail, StaticPage, Vip } from "./Misc";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <StoreProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="spor" element={<Sport />} />
          <Route path="spor/mac/:id" element={<Sport />} />
          <Route path="tahminler" element={<PredictionsPage />} />
          <Route path="tahminler/:slug" element={<PredictionDetail />} />
          <Route path="liderlik" element={<Leaderboard />} />
          <Route path="promosyonlar" element={<Promotions />} />
          <Route path="promosyonlar/:slug" element={<PromotionDetail />} />
          <Route path="page/:slug" element={<StaticPage />} />
          <Route path="vip" element={<Vip />} />
          <Route path="para-yatir" element={<Deposit />} />
          <Route path="para-cek" element={<Withdraw />} />
          <Route path="hesap" element={<AccountLayout />}>
            <Route index element={<Profile />} />
            <Route path="tahminlerim" element={<MyPredictions />} />
            <Route path="islemler" element={<Transactions />} />
            <Route path="kuponlarim" element={<MyCoupons />} />
            <Route path="bonuslarim" element={<MyBonuses />} />
            <Route path="guvenlik" element={<Security />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </StoreProvider>
  </BrowserRouter>,
);
