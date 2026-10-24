import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "./index.css";
import { getToken } from "./api";
import Chat from "./pages/Chat";
import Layout from "./Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Players from "./pages/Players";
import PlayerDetail from "./pages/PlayerDetail";
import Bonuses from "./pages/Bonuses";
import BonusRequests from "./pages/BonusRequests";
import PromoCodes from "./pages/PromoCodes";
import SportsBets from "./pages/SportsBets";
import Trading from "./pages/Trading";
import { PaymentRequests, Transactions, PaymentSystems } from "./pages/Finance";
import { SportsbookReport, FinancialReport, BonusReport } from "./pages/Reports";
import { Users, AuditLogs, Profile } from "./pages/Users";
import Sites from "./pages/Sites";
import { CmsBanners, CmsPromotions, CmsCss, CmsPages, CmsSettings, CmsHome, CmsVip } from "./pages/Cms";
import { PredictionList, PredictionDetail, PredictionPositions, PredictionCategories, PredictionSettings } from "./pages/Predictions";
import System from "./pages/System";

const Private = ({ children }: { children: React.ReactNode }) => (getToken() ? <>{children}</> : <Navigate to="/login" replace />);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Private><Layout /></Private>}>
        <Route index element={<Dashboard />} />
        <Route path="players" element={<Players />} />
        <Route path="players/:id" element={<PlayerDetail />} />
        <Route path="reports/sportsbook" element={<SportsbookReport />} />
        <Route path="reports/financial" element={<FinancialReport />} />
        <Route path="reports/bonus" element={<BonusReport />} />
        <Route path="reports/players" element={<Players title="Oyuncu Raporu" reportMode />} />
        <Route path="finance/deposits" element={<PaymentRequests key="d" type="DEPOSIT" />} />
        <Route path="finance/withdrawals" element={<PaymentRequests key="w" type="WITHDRAWAL" />} />
        <Route path="finance/transactions" element={<Transactions />} />
        <Route path="finance/payment-systems" element={<PaymentSystems />} />
        <Route path="bonuses" element={<Bonuses />} />
        <Route path="bonus-requests" element={<BonusRequests />} />
        <Route path="promo-codes" element={<PromoCodes />} />
        <Route path="bets" element={<SportsBets />} />
        <Route path="sportsbook" element={<Trading />} />
        <Route path="predictions" element={<PredictionList />} />
        <Route path="predictions/:id" element={<PredictionDetail />} />
        <Route path="prediction-positions" element={<PredictionPositions />} />
        <Route path="prediction-categories" element={<PredictionCategories />} />
        <Route path="prediction-settings" element={<PredictionSettings />} />
        <Route path="system" element={<System />} />
        <Route path="chat" element={<Chat />} />
        <Route path="users" element={<Users />} />
        <Route path="sites" element={<Sites />} />
        <Route path="audit-logs" element={<AuditLogs />} />
        <Route path="profile" element={<Profile />} />
        <Route path="cms/home" element={<CmsHome />} />
        <Route path="cms/vip" element={<CmsVip />} />
        <Route path="cms/banners" element={<CmsBanners />} />
        <Route path="cms/promotions" element={<CmsPromotions />} />
        <Route path="cms/pages" element={<CmsPages />} />
        <Route path="cms/settings" element={<CmsSettings />} />
        <Route path="cms/css" element={<CmsCss />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  </BrowserRouter>,
);
