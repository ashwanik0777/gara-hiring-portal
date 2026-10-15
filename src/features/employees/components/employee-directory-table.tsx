"use client";

import React, { useState } from "react";
import Link from "next/link";
import { EmployeeStatus, PublicEmployeeDirectoryItem } from "../types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Users,
  Search,
  Filter,
  ArrowRight,
  Building,
} from "lucide-react";

interface EmployeeDirectoryTableProps {
  employees: PublicEmployeeDirectoryItem[];
  departments: string[];
}

function getStatusBadge(status: EmployeeStatus) {
  switch (status) {
    case EmployeeStatus.PROBATION:
      return <Badge variant="warning">Probation</Badge>;
    case EmployeeStatus.ACTIVE:
      return <Badge variant="success">Active</Badge>;
    case EmployeeStatus.ON_LEAVE:
      return <Badge variant="secondary">On Leave</Badge>;
    case EmployeeStatus.EXITED:
      return <Badge variant="destructive">Exited</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export function EmployeeDirectoryTable({
  employees,
  departments,
}: EmployeeDirectoryTableProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const filtered = employees.filter((emp) => {
    const matchesSearch =
      searchTerm === "" ||
      emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.employeeCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.designation.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.email.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesDept = departmentFilter === "ALL" || emp.department === departmentFilter;
    const matchesStatus = statusFilter === "ALL" || emp.status === statusFilter;

    return matchesSearch && matchesDept && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Search & Filters */}
      <Card className="border-border shadow-xs">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="relative w-full md:w-96">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by name, code, designation, or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm rounded-md border border-input bg-background focus:outline-hidden focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="flex flex-wrap gap-3 w-full md:w-auto items-center">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Filter className="h-3.5 w-3.5" /> Department:
              </div>
              <select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                className="text-xs py-1.5 px-3 rounded-md border border-input bg-background"
              >
                <option value="ALL">All Departments</option>
                {departments.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-1.5 text-xs text-muted-foreground ml-2">
                Status:
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-xs py-1.5 px-3 rounded-md border border-input bg-background"
              >
                <option value="ALL">All Statuses</option>
                <option value={EmployeeStatus.PROBATION}>Probation</option>
                <option value={EmployeeStatus.ACTIVE}>Active</option>
                <option value={EmployeeStatus.ON_LEAVE}>On Leave</option>
                <option value={EmployeeStatus.EXITED}>Exited</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Directory Table */}
      <Card className="border-border shadow-xs">
        <CardHeader className="pb-3 border-b border-border/50">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" /> Employee Directory ({filtered.length})
              </CardTitle>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0 p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-border/70 bg-muted/40 text-muted-foreground text-xs uppercase tracking-wider">
                  <th className="py-3 px-4 font-semibold">Employee</th>
                  <th className="py-3 px-4 font-semibold">Code</th>
                  <th className="py-3 px-4 font-semibold">Department</th>
                  <th className="py-3 px-4 font-semibold">Designation</th>
                  <th className="py-3 px-4 font-semibold">Manager</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 text-xs">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-muted-foreground">
                      No employees match the selected criteria.
                    </td>
                  </tr>
                ) : (
                  filtered.map((emp) => (
                    <tr key={emp.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold text-xs border border-primary/20">
                            {emp.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-medium text-foreground">{emp.name}</div>
                            <div className="text-[11px] text-muted-foreground">{emp.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono font-medium text-foreground">
                        {emp.employeeCode}
                      </td>
                      <td className="py-3.5 px-4 text-muted-foreground flex items-center gap-1.5">
                        <Building className="h-3 w-3 text-muted-foreground/70" />
                        {emp.department}
                      </td>
                      <td className="py-3.5 px-4 font-medium text-foreground">
                        {emp.designation}
                      </td>
                      <td className="py-3.5 px-4 text-muted-foreground">
                        {emp.manager ? (
                          <div>
                            <span className="font-medium text-foreground">{emp.manager.name}</span>
                            <span className="text-[10px] block text-muted-foreground">
                              {emp.manager.designation}
                            </span>
                          </div>
                        ) : (
                          <span className="italic text-muted-foreground/60">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">{getStatusBadge(emp.status)}</td>
                      <td className="py-3.5 px-4 text-right">
                        <Link href={`/recruitment/employees/${emp.id}`}>
                          <Button variant="outline" size="sm" className="h-7 text-xs">
                            View Cockpit <ArrowRight className="h-3 w-3 ml-1" />
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
