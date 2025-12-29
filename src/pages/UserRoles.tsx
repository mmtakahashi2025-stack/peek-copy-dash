import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';
import { SecondaryHeader } from '@/components/layout/SecondaryHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Loader2, Shield, ShieldCheck, User, UserCog } from 'lucide-react';

type AppRole = 'admin' | 'manager' | 'employee';

interface UserWithRole {
  id: string;
  email: string;
  role: AppRole | null;
}

const roleLabels: Record<AppRole, string> = {
  admin: 'Administrador',
  manager: 'Gerente',
  employee: 'Colaborador',
};

const roleColors: Record<AppRole, string> = {
  admin: 'bg-destructive text-destructive-foreground',
  manager: 'bg-warning text-warning-foreground',
  employee: 'bg-secondary text-secondary-foreground',
};

const roleIcons: Record<AppRole, typeof Shield> = {
  admin: ShieldCheck,
  manager: Shield,
  employee: User,
};

export default function UserRoles() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isAdmin, isLoading: isRoleLoading } = useUserRole();
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }

    if (!isRoleLoading && !isAdmin) {
      toast.error('Acesso negado. Apenas administradores podem acessar esta página.');
      navigate('/');
      return;
    }

    if (isAdmin) {
      fetchUsers();
    }
  }, [user, isAdmin, isRoleLoading, navigate]);

  const fetchUsers = async () => {
    try {
      setIsLoading(true);
      
      // Fetch all profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email');

      if (profilesError) {
        console.error('Error fetching profiles:', profilesError);
        toast.error('Erro ao carregar usuários');
        return;
      }

      // Fetch all roles
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role');

      if (rolesError) {
        console.error('Error fetching roles:', rolesError);
      }

      // Combine data
      const usersWithRoles: UserWithRole[] = (profiles || []).map(profile => {
        const userRole = roles?.find(r => r.user_id === profile.id);
        return {
          id: profile.id,
          email: profile.email || 'Email não disponível',
          role: userRole?.role as AppRole | null,
        };
      });

      setUsers(usersWithRoles);
    } catch (error) {
      console.error('Error:', error);
      toast.error('Erro ao carregar dados');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: AppRole | 'none') => {
    if (userId === user?.id) {
      toast.error('Você não pode alterar sua própria role');
      return;
    }

    setUpdatingUserId(userId);

    try {
      if (newRole === 'none') {
        // Remove role
        const { error } = await supabase
          .from('user_roles')
          .delete()
          .eq('user_id', userId);

        if (error) throw error;
        toast.success('Role removida com sucesso');
      } else {
        // Check if user already has a role
        const existingUser = users.find(u => u.id === userId);
        
        if (existingUser?.role) {
          // Update existing role
          const { error } = await supabase
            .from('user_roles')
            .update({ role: newRole })
            .eq('user_id', userId);

          if (error) throw error;
        } else {
          // Insert new role
          const { error } = await supabase
            .from('user_roles')
            .insert({ user_id: userId, role: newRole });

          if (error) throw error;
        }
        
        toast.success(`Role alterada para ${roleLabels[newRole]}`);
      }

      // Refresh users list
      await fetchUsers();
    } catch (error) {
      console.error('Error updating role:', error);
      toast.error('Erro ao atualizar role');
    } finally {
      setUpdatingUserId(null);
    }
  };

  if (!user || isRoleLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <SecondaryHeader title="Gerenciar Usuários" />

      <main className="container mx-auto px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCog className="h-5 w-5" />
              Usuários do Sistema
            </CardTitle>
            <CardDescription>
              Gerencie as permissões de cada usuário. Administradores podem carregar dados históricos além de 3 meses.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Role Atual</TableHead>
                    <TableHead>Alterar Role</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => {
                    const RoleIcon = u.role ? roleIcons[u.role] : User;
                    const isCurrentUser = u.id === user?.id;
                    
                    return (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">
                          {u.email}
                          {isCurrentUser && (
                            <Badge variant="outline" className="ml-2">
                              Você
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {u.role ? (
                            <Badge className={roleColors[u.role]}>
                              <RoleIcon className="h-3 w-3 mr-1" />
                              {roleLabels[u.role]}
                            </Badge>
                          ) : (
                            <Badge variant="outline">Sem role</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={u.role || 'none'}
                            onValueChange={(value) => handleRoleChange(u.id, value as AppRole | 'none')}
                            disabled={isCurrentUser || updatingUserId === u.id}
                          >
                            <SelectTrigger className="w-[180px]">
                              {updatingUserId === u.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <SelectValue />
                              )}
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Sem role</SelectItem>
                              <SelectItem value="admin">Administrador</SelectItem>
                              <SelectItem value="manager">Gerente</SelectItem>
                              <SelectItem value="employee">Colaborador</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <div className="mt-6 flex justify-center">
          <Button variant="outline" onClick={() => navigate('/')}>
            Voltar ao Dashboard
          </Button>
        </div>
      </main>
    </div>
  );
}
