/* eslint-disable @typescript-eslint/no-var-requires */
import { Component, Input, OnDestroy, OnInit, NgZone } from '@angular/core';
import { FormControl, UntypedFormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { Equipment } from 'src/app/_core/models/equipment.model';
import { EquipmentService } from 'src/app/_core/services/api/equipment.service';
import { SnackbarService } from 'src/app/_core/services/snackbar.service';
import { Requirement } from 'src/app/_core/models/requirement.model';
import { environment } from 'src/environments/environment';
import { GlobalService } from 'src/app/_core/services/api/global.service';
import { Subscription } from 'rxjs';
import { AuthenticationService } from 'src/app/_core/services/auth/authentication.service';
import { User } from 'src/app/_core/models';

import { IFormInput } from 'src/app/_core/models/interfaces';
import { PermissionPipe } from 'src/app/_core/shared/pipes/permission.pipe';
import { UsersService } from 'src/app/_core/api/users.service';

import moment from 'moment';

import { Event } from 'src/app/_core/models/event.model';
import { EventsService } from 'src/app/_core/services/api/events.service';
import { MatDatepicker, MatDatepickerInputEvent, MatStartDate } from '@angular/material/datepicker';

//FOR MAT MENU ANGULAR CALENDAR INTEGRATION
import { MatMenuTrigger } from '@angular/material/menu';
import { AddEventModalComponent } from "src/app/wrapper/schedule/add-event-modal/add-event-modal.component";
import { CancelFlightModalComponent } from "src/app/wrapper/schedule/cancel-flight-modal/cancel-flight-modal.component";
import { DeleteModalComponent } from 'src/app/_core/shared/components/modals/delete-modal/delete-modal.component';

//CALENDAR
import { ResizeEvent } from 'angular-resizable-element';

import { ChangeDetectionStrategy,
	ViewChild,
	TemplateRef,
} from '@angular/core';


import { Subject } from 'rxjs';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import {
	CalendarEvent,
	CalendarEventAction,
	CalendarEventTimesChangedEvent,
	CalendarView,
	CalendarEventTitleFormatter,
} from 'angular-calendar';

//const moment = _moment;


@Component({
	selector: 'app-omni-calendar',
	templateUrl: './omni-calendar.component.html',
	styleUrls: ['./omni-calendar.component.scss']
})
export class OmniCalendarComponent implements OnInit {

  @ViewChild('pickerScheduleDate') pickerScheduleDate: MatDatepicker<Date>;
  @ViewChild('calendarItemMenuTrigger') calendarItemMenuTrigger: MatMenuTrigger;

  /** Stores the current selected item id */
	selectedCalendarItemId = 0;
	/** Event object of the selected schedule item */
	selectedCalendarEvent: Event = new Event();
	form: UntypedFormGroup;
	equipment: Equipment = new Equipment();
	equipmentLoaded = false;
	requirementToEdit: Requirement = new Requirement();
	userChangeSub: Subscription;
	
	apiUrl = environment.apiUrl;
	equipmentId = 0;
	/**Requirement id to edit/resolve */
	requirementId = 0;
	squawkId = 0;
	lastHobbsFieldCount = 0;
	lastTachFieldCount = 0;
	selectedSection = 'General';
	sections = ['General'];
	gettingEquipment = false;
	canGeneralSave = false;
	savingEquipment = false;
	gettingStatement = false;
	updating = false;
	canEdit = false;
	timeout: any;
	requirementsToAdd: Requirement[] = [];
	tabs: IFormInput[] = [];
	queryParamsSub: Subscription;
	queryParamsSection = '';
	/** Used to show confirmation on changing tabs when editin an Item */
	isEditingItems = false;



	// upload file
	documentIsLoading = false;
	selectedFile: File = null;
	selectedFileSrc: any;
	imageFormats = ['.jpg', '.png', '.gif', '.jpeg'];

	// clients
	clientsListSub: Subscription;
	clientsList: User[] = [];
	gettingClients = false;

	// Group permissions
	canCreateEquipmentGroup = false;
	canCreateInstructorGroup = false;
	canEditEquipmentGroup = false;
	canEditInstructorGroup = false;



  //BEGINNING OF CODE FOR CALENDAR INTEGRATION
  @ViewChild('modalContent', { static: true }) modalContent: TemplateRef<any>;
  view: CalendarView = CalendarView.Month;
  CalendarView = CalendarView;
  viewDate: Date = new Date();


  modalData: {
    action: string;
    event: CalendarEvent;
  };

  //LOGIC TO IDENTIFY AND TRACK EVENTS
  events: Event[] = [];
  eventsTotal = 0;
  isScheduleDateToday = false;
  scheduleDateSub: Subscription;

  

  /*
  subscribeToScheduleDate() {
  	this.scheduleDateSub = this._eventsService.scheduleDate$
  		.subscribe( response => {
  			this.scheduleDate = response? response : new Date();
  			const momentToday = moment(new Date());
  			const momentScheduleDate = moment(this.scheduleDate);
  			this.isScheduleDateToday = momentToday.isSame(momentScheduleDate, 'date');
  		});
  }
  onDateChange(event: any)
  {
  	this.scheduleDate = new Date(event.value);
  	this._eventsService.scheduleDate$.next(this.scheduleDate);
  }
  */
  eventsContainer: HTMLElement;

  /*
  protected getAllDayEventResizedDates(event: CalendarEvent, daysDiff: number, beforeStart: boolean): {
    start: Date;
    end: Date;
    */


  //CODE FROM INITIAL CALENDAR INTEGRATION
  userEvents: Event[] = [];
  refresh = new Subject<void>();

  activeDayIsOpen = true;

  constructor(
		public  auth: AuthenticationService,
		private _activatedroute: ActivatedRoute,
		private _dialog: MatDialog,
		private _equipmentService: EquipmentService,
		private _globalService: GlobalService,
		private _snackbar: SnackbarService,
		public _router: Router,
		private _permissionPipe: PermissionPipe,
		private _usersService: UsersService,
		public _eventsService: EventsService,
		private modal: NgbModal,
		private _ngZone: NgZone

  ) { }


  // pagination
	//events: Event[] = [];
	eventsHasNextPage = true;
	eventsIsBusy = false;
	eventsPage = 2;
	eventsPerPage = 400;
	eventsSearch = '';
	//eventsTotal = 0;

  //PARENT DATA REFERENCES
  @Input() section: string;
  @Input() currentId: number;
  @Input() pendingEvents: [];

  @Input() currentUser: User = new User();
  @Input() calEvents: CalendarEvent[] = [];
  @Input() modalView: boolean = false;
  //startDate = new Date(this.viewDate.getFullYear(), this.viewDate.getMonth(), 1);
  //endDate = new Date(this.viewDate.getFullYear(), this.viewDate.getMonth() + 1, 0);

  /*
  selectedCalendarView(){
  	return this.view === CalendarView.Month ? '#1391DF' : '#0a58ca';
  	return this.view === CalendarView.Week ? '#1391DF' : '#0a58ca';
  	return this.view === CalendarView.Day ? '#1391DF' : '#0a58ca';
  }
  */

  startDate = new Date(this.viewDate.getFullYear(), this.viewDate.getMonth(), -5);
  endDate = new Date(this.viewDate.getFullYear(), this.viewDate.getMonth() + 2, 0);


  //GET EVENTS DATA
  getEvents(restart = false, scrolled = false, viewAll = false, viewCanceled = false, startDate = null, endDate = null) {
	  if ( !this.eventsIsBusy && this.modalView == false) {
  		this.eventsIsBusy = true;
		this.calEvents = [];

  		if(viewAll){
  			this.eventsPerPage = 250;
  		}
  		this.eventsPage = restart ? 1 : scrolled ? this.eventsPage + 1 : this.eventsPage;

  		let today = new Date();

  		const utcDayStartFormateed = moment(startDate).format('YYYY-MM-DD HH:mm:ss');
  		const utcDayEndFormateed = moment(endDate).format('YYYY-MM-DD HH:mm:ss');

  		this._eventsService.getUserList(
		    viewAll,
		    viewCanceled,
  			this.section,
  			this.currentId,
  			//this.equipmentId,
		    this.eventsPage,
		    this.eventsPerPage,
		    this.eventsSearch,
  			utcDayStartFormateed, utcDayEndFormateed

  		).subscribe( response => {
  			this.events = restart ? response.events.filter(event => event.status != 3) : this.events.concat(response.events);

  			this.events.forEach(event => {
  				event.permissions = this._eventsService.updateEventPermissions(event, this.auth.user);

				const addEvent : CalendarEvent = {
					start: event.start,
					end: event.end,
					title: '',
					meta: event
				}

				this.calEvents.push(addEvent);
			});

			console.log("CAL EVENTS", this.calEvents);


			this.eventsTotal = this.events.length;
  			this.eventsHasNextPage = this.eventsTotal > 0 && this.eventsTotal > this.eventsPage * this.eventsPerPage;
  			this.eventsIsBusy = false;

  			console.log(this.events);

  		}, ( err ) => {
  			this._snackbar.errorHandler('getEvents', err);
  			this.eventsIsBusy = false;
  		});
  	}
  }

  //GETS START DATES FOR BEGINNING AND END OF THE MONTH
  updateViewEvents(viewEvents: any){

  	this.startDate = new Date(this.viewDate.getFullYear(), this.viewDate.getMonth(), -5);
  	this.endDate = new Date(this.viewDate.getFullYear(), this.viewDate.getMonth() + 2, 0);
  	//console.log("viewEvents",viewEvents);

    if (this.currentId) { // existing item
      //this.getEvents(true);
      this.getEvents(true, false, true, true, this.startDate, this.endDate);
      //this.getEventList();
    }else{
      //sched-o-matic preview
      this.events = this.pendingEvents;
    }
  	//this.getEvents(true, false, true, true, this.startDate, this.endDate);
  }

  // ---------------------------- FOR RESERVATION MODAL FUNCTIONALITY ------------------------------ //
  openEventModal(event?: Event, section: 'Details' | 'Issues' = 'Details') {
  	const dialogConfig = new MatDialogConfig();
  	dialogConfig.autoFocus = true;
  	dialogConfig.panelClass = ['modal-primary'];
  	dialogConfig.data = {event, section};
  	const dialogRef = this._dialog.open(AddEventModalComponent, dialogConfig);
  	dialogRef.afterClosed().subscribe( data => {
  		 console.log('AddEventModalComponent output:', data);
  		if ( data.message === 'saved!' || data.event.id > 0 ) {
  			this.getEvents(true, false, true, true, this.startDate, this.endDate);
  		}
  	});
  }


  delete(event: Event) {
  	const data = {
  		text: event.name,
  		id: event.id,
  		service: 'event'
  	};
  	const dialogConfig = new MatDialogConfig();
  	dialogConfig.autoFocus = true;
  	dialogConfig.panelClass = 'modal-primary';
  	dialogConfig.height = 'auto';
  	dialogConfig.data = data;
  	const dialogRef = this._dialog.open(DeleteModalComponent, dialogConfig);
  	dialogRef.afterClosed().subscribe(data => {
  		if (data && data === 'deleted!') {
			this.getEvents(true, false, true, true, this.startDate, this.endDate);
  		}
  	});
  }

  //-------------------- MAT MENU -----------------------

  cancelFlight(option) {
  	const dialogConfig = new MatDialogConfig();
  	dialogConfig.autoFocus = true;
	  dialogConfig.data = {
      event: this.selectedCalendarEvent,
      option: option
	  }

  	dialogConfig.panelClass = ['modal-primary', 'modal-thin'];

  	const dialogRef = this._dialog.open(CancelFlightModalComponent, dialogConfig);
  	dialogRef.afterClosed().subscribe(data => {
  		if (data && data.detail === 'saved!') {
  			this._snackbar.show('Event cancelled', 'close', 'success');
  			this.getEvents(true, false, true, true, this.startDate, this.endDate);
  		}
  	});
  }

  //------------ USED TO RETRIEVE LESSON NAMES ----------

  lessonName = [
  	" ",
  	"Instructional Flight (Dual)",
  	"Instructional Ground",
  	"Solo Student",
  	"Solo Rental",
  	"Discovery Flight",
  	"Scenic Flight",
  	"Instructional Client Aircraft",
  	"Crew",
  	"Stage Check Flight",
  	"Maintenance",
  	"Check Ride",
  	"Stage Check Ground",
  	"Time Block",
  	"Discovery Extended",
  	"Discovery Ultimate",
  ];

  handleEvent(action: string, event: CalendarEvent): void {
  	this.modalData = { event, action };
  	this.modal.open(this.modalContent, { size: 'lg' });
  }

  setView(view: CalendarView)
  {
  	this.view = view;
  }

  setMonthView(view) {
  	this.view = view;
  }

  closeOpenMonthViewDay() {
  	this.activeDayIsOpen = false;
  }

  ngOnInit() {
	if (this.currentId && this.modalView == false) {
		this._activatedroute.paramMap.subscribe(params => {
  			this.currentId = Number(params.get('id'));
			if (this.currentId) { // existing item
				//this.getEvents(true);
				this.pendingEvents = [];
				this.getEvents(true, false, true, true, this.startDate, this.endDate);
				//this.getEventList();
			}else{
				//sched-o-matic preview
				this.events = this.pendingEvents;
				console.log(this.events);

			}
			this.requirementId = Number(params.get('requirementId'));
			this.squawkId = Number(params.get('squawkId'));
  		});
	}
	else {
		console.log("OMNI MODAL VIEW!!!"); 
	}
  	

  }

  ngOnChanges() {

	  if (!this.currentId) { // existing item
		//console.log("hey!")
		this.events = this.pendingEvents;

		}
  }

}
