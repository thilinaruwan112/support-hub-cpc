
"use client";

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Loader2, PlusCircle, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { getStudentsByCourseCode, createDeliveryOrderForStudent, getDeliveryOrdersForStudent, getCourses, getDeliverySettingsForCourse } from '@/lib/api';
import type { StudentInBatch, DeliveryOrder, Course, DeliverySetting } from '@/lib/types';
import { Checkbox } from '@/components/ui/checkbox';

const ITEMS_PER_PAGE = 25;
const LOCAL_STORAGE_KEY = 'deliveryOrderDefaults';

// --- Sub-components for actions ---

const CreateOrderDialog = ({ student, selectedBatch }: { student: StudentInBatch, selectedBatch: Course }) => {
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [selectedDeliverySettingId, setSelectedDeliverySettingId] = useState('');
    const [trackingNumber, setTrackingNumber] = useState('');
    const [deliveryNotes, setDeliveryNotes] = useState('');
    const [currentStatus, setCurrentStatus] = useState('1'); // Default to '1' (Processing)
    const [rememberSettings, setRememberSettings] = useState(false);
    const queryClient = useQueryClient();

    // Load saved settings from localStorage when the dialog is opened
    useEffect(() => {
        if (isDialogOpen) {
            try {
                const savedDefaults = localStorage.getItem(LOCAL_STORAGE_KEY);
                if (savedDefaults) {
                    const { deliverySettingId, status, remember, tracking } = JSON.parse(savedDefaults);
                    if (remember) {
                        setSelectedDeliverySettingId(deliverySettingId || '');
                        setCurrentStatus(status || '1');
                        setTrackingNumber(tracking || '');
                        setRememberSettings(true);
                    }
                }
            } catch (error) {
                console.error("Failed to load saved settings:", error);
            }
        }
    }, [isDialogOpen]);

    const { data: deliverySettings, isLoading: isLoadingSettings } = useQuery<DeliverySetting[]>({
        queryKey: ['deliverySettings', selectedBatch.courseCode],
        queryFn: () => getDeliverySettingsForCourse(selectedBatch.courseCode),
        enabled: isDialogOpen, // Only fetch when the dialog is open
    });
    
    // Effect to default to the first delivery setting if available and none is selected
    useEffect(() => {
        if (!isLoadingSettings && deliverySettings && deliverySettings.length > 0 && !selectedDeliverySettingId) {
            const savedDefaults = localStorage.getItem(LOCAL_STORAGE_KEY);
            if(savedDefaults) {
                const { deliverySettingId, remember } = JSON.parse(savedDefaults);
                if(remember && deliverySettingId) {
                     setSelectedDeliverySettingId(deliverySettingId);
                     return;
                }
            }
            setSelectedDeliverySettingId(deliverySettings[0].id);
        }
    }, [isLoadingSettings, deliverySettings, selectedDeliverySettingId]);


    const createOrderMutation = useMutation({
        mutationFn: createDeliveryOrderForStudent,
        onSuccess: () => {
            toast({
                title: 'Order Created!',
                description: `A new delivery order for ${student.full_name} has been created.`,
            });
            queryClient.invalidateQueries({ queryKey: ['studentDeliveryOrders', student.username] });

            // Save settings if checked
            if (rememberSettings) {
                try {
                    const defaults = {
                        deliverySettingId: selectedDeliverySettingId,
                        status: currentStatus,
                        tracking: trackingNumber,
                        remember: true,
                    };
                    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(defaults));
                } catch (error) {
                    console.error("Failed to save settings:", error);
                }
            } else {
                // Clear saved settings if unchecked
                localStorage.removeItem(LOCAL_STORAGE_KEY);
            }

            // Reset for next entry only if not remembering settings
            if (!rememberSettings) {
                setSelectedDeliverySettingId(deliverySettings?.[0]?.id || '');
                setCurrentStatus('1');
                setTrackingNumber('');
            }
            setDeliveryNotes(''); // Always clear notes
            setIsDialogOpen(false);
        },
        onError: (error: Error) => {
            toast({
                variant: 'destructive',
                title: 'Failed to create order',
                description: error.message,
            });
        },
    });

    const handleCreateOrder = () => {
        const selectedSetting = deliverySettings?.find(s => s.id === selectedDeliverySettingId);
        if (!selectedSetting) {
            toast({ variant: 'destructive', title: 'Error', description: 'Please select a delivery pack.' });
            return;
        }

        createOrderMutation.mutate({
            studentNumber: student.username,
            courseCode: selectedBatch.courseCode,
            deliverySetting: selectedSetting,
            notes: deliveryNotes,
            address: `${student.address_line_1 || ''}, ${student.city || ''}`,
            fullName: student.full_name,
            phone: student.telephone_1,
            currentStatus: currentStatus,
            trackingNumber: trackingNumber || 'PENDING',
        });
    };

    return (
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
                <Button variant="default" size="sm">
                    <PlusCircle className="mr-2 h-4 w-4" /> Create Order
                </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>New Delivery for {student.full_name}</DialogTitle>
                    <DialogDescription>
                        Select a delivery pack and confirm the details for this order.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="delivery-pack">Delivery Pack</Label>
                        {isLoadingSettings ? (
                            <Skeleton className="h-10 w-full" />
                        ) : (
                            <Select value={selectedDeliverySettingId} onValueChange={setSelectedDeliverySettingId}>
                                <SelectTrigger id="delivery-pack">
                                    <SelectValue placeholder="Select a delivery pack..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {deliverySettings?.map(setting => (
                                        <SelectItem key={setting.id} value={setting.id}>
                                            {setting.delivery_title} (LKR {setting.value})
                                        </SelectItem>
                                    ))}
                                    {deliverySettings?.length === 0 && <p className="p-4 text-sm text-muted-foreground">No settings found.</p>}
                                </SelectContent>
                            </Select>
                        )}
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="tracking-number">Tracking Number (Optional)</Label>
                        <Input id="tracking-number" value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} placeholder="Enter tracking number..."/>
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="order-status">Status</Label>
                        <Select value={currentStatus} onValueChange={setCurrentStatus}>
                            <SelectTrigger id="order-status">
                                <SelectValue placeholder="Set initial status..." />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="1">Processing</SelectItem>
                                <SelectItem value="2">Packed</SelectItem>
                                <SelectItem value="3">Delivered</SelectItem>
                                <SelectItem value="4">Removed</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                     <div className="space-y-2">
                        <Label>Student Address</Label>
                        <p className="text-sm p-3 rounded-md bg-muted text-muted-foreground">
                            {`${student.address_line_1 || 'N/A'}, ${student.address_line_2 || ''}, ${student.city || ''}`}
                        </p>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="delivery-notes">Notes (Optional)</Label>
                        <Textarea id="delivery-notes" value={deliveryNotes} onChange={(e) => setDeliveryNotes(e.target.value)} placeholder="Special instructions..."/>
                    </div>
                    <div className="flex items-center space-x-2 pt-2">
                        <Checkbox 
                            id="remember-settings" 
                            checked={rememberSettings}
                            onCheckedChange={(checked) => setRememberSettings(Boolean(checked))}
                        />
                        <Label htmlFor="remember-settings" className="text-sm font-normal text-muted-foreground">
                            Remember my selections for next entry.
                        </Label>
                    </div>
                </div>
                <DialogFooter>
                    <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                    <Button onClick={handleCreateOrder} disabled={createOrderMutation.isPending || isLoadingSettings}>
                        {createOrderMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Confirm Order
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

const OrderStatusCell = ({ student, selectedBatch }: { student: StudentInBatch, selectedBatch: Course }) => {
    const { data: deliveryOrders, isLoading, isError } = useQuery<DeliveryOrder[]>({
        queryKey: ['studentDeliveryOrders', student.username],
        queryFn: () => getDeliveryOrdersForStudent(student.username),
        staleTime: 5 * 60 * 1000,
    });
    
    const orderForBatch = useMemo(() => {
        if (!deliveryOrders) return undefined;
        return deliveryOrders.find(order => order.course_code === selectedBatch.courseCode);
    }, [deliveryOrders, selectedBatch.courseCode]);

    if (isLoading) {
        return <Skeleton className="h-6 w-24" />;
    }

    if (isError) {
        return <Badge variant="destructive">Error</Badge>;
    }

    if (orderForBatch) {
        return (
             <div className="flex flex-col items-start gap-1">
                <Badge variant="secondary">{orderForBatch.id}</Badge>
                <span className="text-xs text-muted-foreground">{orderForBatch.tracking_number}</span>
            </div>
        );
    }
    
    return <CreateOrderDialog student={student} selectedBatch={selectedBatch} />;
};


// --- Main Page Component ---
export default function BatchDeliveryOrdersPage() {
    const [selectedCourseId, setSelectedCourseId] = useState<string>('');
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);

    const { data: courses, isLoading: isLoadingCourses } = useQuery<Course[]>({
        queryKey: ['allCourses'],
        queryFn: getCourses,
        staleTime: Infinity,
    });

    const selectedCourse = useMemo(() => {
        return courses?.find(c => c.id === selectedCourseId);
    }, [courses, selectedCourseId]);

    const { data: students, isLoading: isLoadingStudents, isError, error } = useQuery<StudentInBatch[]>({
        queryKey: ['studentsByCourse', selectedCourse?.courseCode],
        queryFn: () => getStudentsByCourseCode(selectedCourse!.courseCode),
        enabled: !!selectedCourse?.courseCode,
    });
    
    useEffect(() => {
        setCurrentPage(1);
    }, [selectedCourseId, searchTerm]);

    const filteredStudents = useMemo(() => {
        if (!students) return [];
        const lowercasedFilter = searchTerm.toLowerCase();
        if (!lowercasedFilter) return students;
        return students.filter(student =>
            (student.username?.toLowerCase() || '').includes(lowercasedFilter) ||
            (student.full_name?.toLowerCase() || '').includes(lowercasedFilter)
        );
    }, [students, searchTerm]);

    const totalPages = Math.ceil((filteredStudents?.length || 0) / ITEMS_PER_PAGE);
    const paginatedStudents = useMemo(() => {
        if (!filteredStudents) return [];
        return filteredStudents.slice(
            (currentPage - 1) * ITEMS_PER_PAGE,
            currentPage * ITEMS_PER_PAGE
        );
    }, [filteredStudents, currentPage]);
    
    return (
        <div className="p-4 md:p-8 space-y-6 pb-20">
            <header>
                <h1 className="text-3xl font-headline font-semibold">Batch Delivery Orders</h1>
                <p className="text-muted-foreground">Select a batch to view student delivery status.</p>
            </header>

            <Card className="shadow-lg">
                <CardHeader>
                    <CardTitle>Select Batch</CardTitle>
                </CardHeader>
                <CardContent>
                    <Select value={selectedCourseId} onValueChange={setSelectedCourseId} disabled={isLoadingCourses}>
                        <SelectTrigger className="w-full md:w-1/2">
                            <SelectValue placeholder={isLoadingCourses ? "Loading batches..." : "Choose a batch to load students..."} />
                        </SelectTrigger>
                        <SelectContent>
                            {courses?.map(course => (
                                <SelectItem key={course.id} value={course.id}>
                                    {course.name} ({course.courseCode})
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </CardContent>
            </Card>

            {selectedCourse && (
                 <Card className="shadow-lg">
                    <CardHeader>
                        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                            <div>
                                <CardTitle>Students in {selectedCourse.name}</CardTitle>
                                <CardDescription>
                                     {isLoadingStudents ? "Loading..." : `Showing ${paginatedStudents.length} of ${filteredStudents.length} students.`}
                                </CardDescription>
                            </div>
                            <div className="relative w-full sm:w-auto sm:max-w-xs">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search student or ID..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-10"
                                />
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {isLoadingStudents && (
                            <div className="space-y-2">
                                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                            </div>
                        )}
                        {isError && (
                             <Card className="border-destructive">
                                <CardHeader><CardTitle className="flex items-center gap-2 text-destructive"><AlertTriangle /> Error Loading Students</CardTitle></CardHeader>
                                <CardContent><p>{error?.message}</p></CardContent>
                            </Card>
                        )}
                        {!isLoadingStudents && !isError && (
                            <div className="relative w-full overflow-auto border rounded-lg">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Student ID</TableHead>
                                            <TableHead>Full Name</TableHead>
                                            <TableHead>Delivery Order Status</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {paginatedStudents.length > 0 ? paginatedStudents.map(student => (
                                            <TableRow key={student.student_course_id}>
                                                <TableCell className="font-medium">{student.username}</TableCell>
                                                <TableCell>{student.full_name}</TableCell>
                                                <TableCell>
                                                    <OrderStatusCell 
                                                        student={student} 
                                                        selectedBatch={selectedCourse!} 
                                                    />
                                                </TableCell>
                                            </TableRow>
                                        )) : (
                                            <TableRow>
                                                <TableCell colSpan={3} className="text-center h-24">
                                                    No students found matching your search.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </CardContent>
                    {totalPages > 1 && (
                        <CardFooter className="flex items-center justify-center space-x-2 pt-6">
                            <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage === 1}>Previous</Button>
                            <span className="text-sm text-muted-foreground">Page {currentPage} of {totalPages}</span>
                            <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))} disabled={currentPage === totalPages}>Next</Button>
                        </CardFooter>
                    )}
                 </Card>
            )}
        </div>
    );
}
