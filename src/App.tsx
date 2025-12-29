import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { SheetDataProvider } from "./contexts/SheetDataContext";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Targets from "./pages/Targets";
import ExcellenceStandard from "./pages/ExcellenceStandard";
import Leads from "./pages/Leads";
import UserRoles from "./pages/UserRoles";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SheetDataProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Routes>
              <Route path="/" element={<Index />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/metas" element={<Targets />} />
                <Route path="/padrao-excelencia" element={<ExcellenceStandard />} />
                <Route path="/leads" element={<Leads />} />
                <Route path="/usuarios" element={<UserRoles />} />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </SheetDataProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
