import { Component, Input, OnInit, EventEmitter, OnDestroy, Output } from '@angular/core';
import { AbstractControl, Form, FormArray, FormControl, FormGroup, NonNullableFormBuilder, UntypedFormControl, UntypedFormGroup, Validators } from '@angular/forms';
import { Observable, Subscription, filter } from 'rxjs';
import { AuthenticationService } from 'src/app/_core/services/auth/authentication.service';
import { UsersService } from 'src/app/_core/api/users.service';
import { User } from 'src/app/_core/models/user.model';
import { MatOptionSelectionChange } from '@angular/material/core';
import { MatCheckboxChange } from '@angular/material/checkbox';
import { DatePipe, CurrencyPipe} from '@angular/common';
import { LoanApplication, savedLoanNote } from 'src/app/_core/models/loan-application.model';
import { QuotedRating } from 'src/app/_core/models/quoted-rating.model';
import { trigger, transition, style, animate } from '@angular/animations';
import moment from 'moment';
import { EventsService } from 'src/app/_core/services/api/events.service';
import { SnackbarService } from 'src/app/_core/services/snackbar.service';
import { MatTabChangeEvent } from '@angular/material/tabs';
import { FormBuilder } from '@angular/forms';
import { match } from 'assert';

declare const require: any;
const inputs = require('./../../../../../assets/json/inputs-loan-application.json');

/**
 * Represents structure of options for form's relevant rating 'mat-select' field
 * @property ratingName
 * @property ratingValue
 */
export interface RatingOption {
  ratingName  : string,
  ratingValue : number
}

/**
 * Represents 'literal' structure of form's dynamic rating fields (price, disbursement amount and funds release date)
 * @property "name"
 * @property "backendName"
 * @property "text"
 * @property "type"
 * @property "optional"
 * @property "placeholder"?
 */
export interface DynamicLoanInput {
  "name"          : string,
  "backendName"   : string,
  "text"          : string,
  "type"          : string,
  "optional"      : boolean,
  "placeholder"?  : string,
  "ratingId"?     : number
}


@Component({
  selector: 'app-loan-application',
  templateUrl: './loan-application.component.html',
  styleUrl: './loan-application.component.scss',
  animations: [
    trigger('slideInOut', [
      transition(':enter', [
        style({transform: 'translateX(-100%)'}),
        animate('0.8s ease-in', style({transform: 'translateX(0%)'}))
      ]),
      transition(':leave', [
        animate('0.8s ease-out', style({transform: 'translateX(-100%)'}))
      ])
    ])
  ]
})
export class LoanApplicationComponent implements OnInit, OnDestroy{
  @Input() applicant: User;
  @Input() authorizedUser: User;
  @Input() applicantCourses: {id: number, text: string}[] = [];
  @Input() existingApplicationsView: boolean = false;
  @Output() eventEmitter = new EventEmitter<any>();

  loanInputs = inputs[0].inputs;
  loanForm: UntypedFormGroup;
  creatingLoanForm = true;
  currentDate: Date = new Date();
  lenderDataSubscription: Subscription;
  gettingLenderData = true;
  loanDataSubscription: Subscription;
  gettingLoanData = true;
  relevantRatings: {id: number, text: string}[];
  selectedRatings: RatingOption[] = [];

  /**
   * Represents the global-scoped array of selected ratings for loan application
   */
  currentRatingValues: number[] = [];
  
  //Contains 'DynamicRating' objects
  dynamicRatingObjects: {ratingId: number, ratingPrice: DynamicLoanInput, ratingDisbursement: DynamicLoanInput, ratingDisbursementDate: DynamicLoanInput}[] = [];
  loanNotesText: string = "";
  /**
   * Names of form controls which depend on the 'livingAssistanceIncluded' checkbox form control:
   * 1. [0] - 'livingAssistanceIncluded'
   * 2. [1] - 'livingAssistanceDates'
   */
  livingExpenseControlNames: string[] = ['livingAssistanceTotal', 'livingAssistanceDates'];
  checkboxChecked: boolean;
  loanApplication: LoanApplication;
  quotedRatings: QuotedRating[];
  lenderArray: {id: number, name: string}[] = [];
  loadingNextLoanForm: boolean;

  loanDataFormatting = false;
  //IMPORTANT!! BE SURE TO CHANGE TO MODEL DATA TYPE AFTERWARD!!
  existingLoanApplications: any[] = [];
  formattedCurrencyEvent: any;
  currentLoanIndex = 0;
  pendingNoteToSave: savedLoanNote;
  noteToSave: savedLoanNote;
  savedNotesArray: savedLoanNote[] = [];
  loanNoteText = "";
  lastNote = "";
  notesExtra = "";
  livingDisbursementDatesArray: {disbursementDateName: string, disbursementDate: Date}[] = [];

  panelOpenState = false;

  subscribedValue: any;
  formSubscriptionArray: Subscription[] = [];
  currentFormValue: string;
  previousFormValue: string;
  currentControl: AbstractControl;
  currentRatingGroup: FormGroup;
  currentRatingControlName: string;
  focusControlValue: string;

  constructor(
    private datePipe: DatePipe,
    private usdFormatter: CurrencyPipe,
    private _usersService: UsersService,
    private _eventsService: EventsService,
    private _snackbar: SnackbarService,
    private formBuilder: FormBuilder,
  )
  {}

  ngOnInit(): void {
    this.createForm();
    //console.log("THIS USER!!!", this.applicant);
  }

  ngOnDestroy(): void {
    if (this.lenderDataSubscription) {
      this.lenderDataSubscription.unsubscribe();
    };
    if (this.loanDataSubscription) {
      this.loanDataSubscription.unsubscribe();
    };
    this.formSubscriptionArray.forEach(formSubscription => formSubscription.unsubscribe());
  }

  getLenderData() {
    this.lenderDataSubscription = this._usersService.getSubTypes().subscribe(response => {
      this.gettingLenderData = true;

      this.lenderArray = response.client_types.map(subtype => {
        return {id: subtype.id, name: subtype.name};
      });
      //console.log("LENDER ARRAY/OPTIONS", this.lenderArray);
      this.gettingLenderData = false;
    });
  }

  getExistingLoanData(clientId: number) {
    this.loanDataSubscription = this._usersService.getLoanApplications(clientId).subscribe(response => {    
      this.gettingLoanData = true;
      let relevantLender: any;

      this.existingLoanApplications = response.loanData;
      //console.log("INITIAL LOAN APPLICATIONS FOR THIS USER!!", response);

      //ASSIGN LENDER NAME AND PARSE RATINGS JSON STRING
      this.existingLoanApplications.forEach((existingLoanApplication) => {
        relevantLender = this.lenderArray.filter((relevantLender) => {
          return relevantLender.id === existingLoanApplication.lender_name; 
        });
        existingLoanApplication.lenderName = relevantLender[0].name;
        //console.log("RELEVANT LENDER!!---->>", [relevantLender, existingLoanApplication.lenderName]);
      });

      if (this.existingLoanApplications.length > 0) {
        this.changeView("Current Applications");
      }
      this.gettingLoanData = false;
      //console.log("GETTING LOAN DATA FALSE??", this.gettingLoanData);
      //console.log("LOAN APPLICATIONS WITH LENDER NAME (STRING)!!", this.existingLoanApplications);
      //console.log("FORMATTED RATINGS ARRAY", this.formattedRatingsArray);
    });
  }

  createForm() {
    const validations = [];
    validations.push(Validators.required);

    this.loanForm = new UntypedFormGroup({});

    //CREATING AND INITIALIZING EMPTY FORM ARRAYS WITHIN LOAN FORM
    this.loanForm.addControl('livingAssistanceDates', this.formBuilder.array([], validations));
    this.loanForm.addControl('ratingControlObjects', this.formBuilder.array([], validations));
    //console.log("THIS FORM GROUP", this.loanForm);
    

    //Setting initial controls
    this.loanInputs.forEach(loanInput => {
      loanInput.optional === "true" ? loanInput.optional = true : loanInput.optional = false;

      loanInput.optional === false ? this.loanForm.addControl(loanInput.name, new UntypedFormControl('', validations)) 
      : this.loanForm.addControl(loanInput.name, new UntypedFormControl('', []));

      if (loanInput.name == "relevantRatings") {
          //console.log("APPLICANT COURSES----->>>>>", this.applicantCourses);
          loanInput.options = this.applicantCourses;
          this.relevantRatings = loanInput.options;
      };

      if (loanInput.name == "lenderName") {
        this.lenderDataSubscription = this._usersService.getSubTypes().subscribe(response => {
          this.gettingLenderData = true;
          this.lenderArray = response.client_types.map(subtype => {
            return {id: subtype.id, name: subtype.name};
          });

          loanInput.options = this.lenderArray;
          this.gettingLenderData = false;
          this.getExistingLoanData(this.applicant.id);
        });
      };

      if (loanInput.name == "livingAssistanceTotal") {
        this.loanForm.get(loanInput.name)['controlName'] = 'livingAssistanceTotal';
      }
    });
    this.registerControlsForSubscription();
    this.onStipendVerification(false);
  }

  addLivingDisbursementDate() {
    //const livingDisbursementFormBuilder = new NonNullableFormBuilder();
    
    const validations = [];
    validations.push(Validators.required);


    const livingDisbursementDateObject: DynamicLoanInput = {
      "name"          : `livingAssistanceDate-${(this.loanForm.controls.livingAssistanceDates as FormArray).length + 1}`,
      "backendName"   : "living_assistance_date",
      "text"          : `Living Assistance Disbursement Date ${(this.loanForm.controls.livingAssistanceDates as FormArray).length + 1}`,
      "type"          : "date",
      "optional"      : false,
      "placeholder"   : "mm/dd/yyyy"
    };

    const livingDisbursementDateControl = this.formBuilder.control('', validations);
    livingDisbursementDateControl['livingDisbursementDateObject'] = livingDisbursementDateObject;
    //console.log("TESTING ADDING JSON OBJECT TO DYNAMIC DATE CONTROL:", livingDisbursementDateControl);


   (this.loanForm.get('livingAssistanceDates') as FormArray).push(livingDisbursementDateControl);
   (this.loanForm.get('livingAssistanceDates') as FormArray).updateValueAndValidity();
    

    //console.log("ADD LIVING DISBURSEMENT ACTIVATED!!", this.loanForm);
  }

  get livingAssistanceDateControls() {
    return this.loanForm.get('livingAssistanceDates') as FormArray;
  }

  get ratingPriceControls() {
    const ratingPriceControls: AbstractControl<any, any>[] = [];

    (this.loanForm.controls.ratingControlObjects as FormArray).controls.forEach(ratingControlObject => {
      const ratingPriceControl = ratingControlObject.get('ratingPriceInputControl');
      ratingPriceControls.push(ratingPriceControl);
    });

    return ratingPriceControls;
  }

  get ratingDisbursementControls() {
    const ratingDisbursementControls: AbstractControl<any, any>[] = [];

    (this.loanForm.controls.ratingControlObjects as FormArray).controls.forEach(ratingControlObject => {
      const ratingDisbursementControl = ratingControlObject.get('ratingDisbursementInputControl');
      ratingDisbursementControls.push(ratingDisbursementControl);
    });

    return ratingDisbursementControls;
  }

  get ratingDisbursementDateControls() {
    const ratingDisbursementDateControls: AbstractControl<any, any>[] = [];

    (this.loanForm.controls.ratingControlObjects as FormArray).controls.forEach(ratingControlObject => {
      const ratingDisbursementDateControl = ratingControlObject.get('ratingDisbursementDateControl');
      ratingDisbursementDateControls.push(ratingDisbursementDateControl);
    });

    return ratingDisbursementDateControls;
  }


  /**
   * Changes view based upon the value of 'selectedView'
   * @param selectedView - if "New Application", triggers a new loan form, or shows current forms if "Current Applications"
   */
  changeView(selectedView: string) {
    if (selectedView === "New Application") {
      this.initializeNewApplication();
      this.existingApplicationsView = false;
      //this.processRatingOptions(null, this.formattedRatingsArray[this.currentTab.index]);
    }
    else if (selectedView === "Current Applications") {
      this.currentLoanIndex = 0;
      this.populateGeneralFormData(this.currentLoanIndex);
      this.existingApplicationsView = true;
      //this.processRatingOptions(this.existingLoanApplications[this.currentTab.index].relevant_ratings);
    }
  }

  ratingPriceOptionsSub: Subscription;
  ratingDisbursementOptionsSub: Subscription;
  ratingDisbursementDateOptionsSub: Subscription;
  dynamicRatingsSubscriptions: Subscription[] = [];

  /**
   * Takes user-selected ratings, generates the necessary rating inputs based upon the 'id' value, and dissolves the respective rating form
   * controls/inputs that have been deselected by the user
   * @param event 
   */
  processRatingOptions(event: number[]) {
    //console.log("THE EVENT----->>>>>", event);

    //LOCAL VALIDATION ARRAY
    const validations = [];
    validations.push(Validators.required);

    //Defining 'nonNullable' Form Builder instance to update respective FormArrays
    let newLoanFormBuilder: FormBuilder = new FormBuilder();

    this.currentRatingValues = event;

    if (this.currentRatingValues.length > 0) {
      //console.log("CURRENT RATING VALUES LENGTH", this.currentRatingValues.length);

      this.currentRatingValues.forEach(currentRatingValue => {
        //console.log("ITERATING RATING OBJECTS!");

        const matchingRatingValue = (this.loanForm.controls.ratingControlObjects as FormArray).controls.find( (ratingControlObject) => ratingControlObject['ratingId'] == currentRatingValue);
        //console.log("MATCHING RATING VALUE???----->>>>>", matchingRatingValue);


        if (matchingRatingValue == undefined) {
          const relevantRatingIndex = this.relevantRatings.findIndex(relevantRating => relevantRating.id === currentRatingValue);
          const newRatingText = this.relevantRatings[relevantRatingIndex].text;
          //console.log("MATCHING THIS RELEVANT RATING----->>>>>", this.relevantRatings[relevantRatingIndex]);
          
          //USING CURRENT RATING VALUE AND MATCHING RELEVANT RATING TEXT TO ASSIGN RATING ID TO CONTROLS AND CREATE RATING OBJECTS
          const ratingControlObjects = (this.loanForm.get('ratingControlObjects') as FormArray);

          const ratingControlObject = newLoanFormBuilder.group({
            ratingPriceInputControl: newLoanFormBuilder.control('', validations),
            ratingDisbursementInputControl: newLoanFormBuilder.control('', validations),
            ratingDisbursementDateControl: newLoanFormBuilder.control('', validations),
          });
      

          //ASSIGNING RATING ID TO RATING FORM GROUP OBJECT
          ratingControlObject['ratingId'] = currentRatingValue;

          ratingControlObject.get('ratingPriceInputControl')['controlName'] = 'ratingPriceInputControl';
          ratingControlObject.get('ratingDisbursementInputControl')['controlName'] = 'ratingDisbursementInputControl';

          //CONSTRUCTING RATING OBJECTS TO PASS INTO RATING FORM GROUP
          const ratingPriceObject: DynamicLoanInput = {
            "name"        : `ratingPrice-${currentRatingValue}`,
            "backendName" : `rating_price-${currentRatingValue}`,
            "text"        : `Quoted Amount for ${newRatingText}`,
            "type"        : "text",
            "optional"    : false,
            "placeholder" : "$0.00",
          };
          
          const ratingDisbursementObject: DynamicLoanInput = {
            "name"        : `ratingDisbursement-${currentRatingValue}`,
            "backendName" : `rating_disbursement-${currentRatingValue}`,
            "text"        : `Rating Disbursement for ${newRatingText}`,
            "type"        : "text",
            "optional"    : false,
            "placeholder" : "$0.00",
          };

          const ratingDisbursementDateObject: DynamicLoanInput = {
            "name"          : `ratingDisbursementRelease-${currentRatingValue}`,
            "backendName"   : `rating_funds_release-${currentRatingValue}`,
            "text"          : `Release Date of Funds for ${newRatingText}`,
            "type"          : "date",
            "optional"      : false,
            "placeholder"   : "mm/dd/yyyy",
          };
          
          //PASSING IN RATING OBJECTS
          ratingControlObject.controls.ratingPriceInputControl['ratingPriceObject'] = ratingPriceObject;
          ratingControlObject.controls.ratingDisbursementInputControl['ratingDisbursementObject'] = ratingDisbursementObject;
          ratingControlObject.controls.ratingDisbursementDateControl['ratingDisbursementDateObject'] = ratingDisbursementDateObject;

          //SUBSCRIPTIONS FOR CURRENCY FORMATTING
          this.subscribeToFormGroupValues(ratingControlObject);

          //console.log("FORM GROUP OBJECT ADDED TO LOAN FORM----->>>>>", ratingControlObject);

          //PUSHING COMPLETED RATING CONTROL OBJECT INTO RATING FORM ARRAY
          ratingControlObjects.push(ratingControlObject);

          //console.log("LOAN FORM WITH RATING CONTROL OBJECTS ADDED----->>>>>", this.loanForm.controls);

        }
        else if (matchingRatingValue !== undefined) {
          console.log("MATCHING RATING ID FOUND!", matchingRatingValue);

        }
      });
      

      //DETERMINE IF RATING HAS BEEN DESELECTED AND REMOVE FORM GROUP OBJECT ACCORDINGLY
      const ratingControlObjectsArray = (this.loanForm.controls.ratingControlObjects as FormArray);
      const ratingControlRemovalIndexes: number[] = [];

      ratingControlObjectsArray.controls.forEach((ratingControlGroup, index) => {

        const currentlySelectedRating = this.currentRatingValues.find( (currentRatingValue) => currentRatingValue == ratingControlGroup['ratingId']);

        //console.log("RATING CONTROL MATCH???", [currentlySelectedRating, ratingControlGroup['ratingId']]);

        if (currentlySelectedRating == undefined) {
          //console.log("EXPIRED RATING CONTROL DETECTED");
          ratingControlRemovalIndexes.push(index); 
        };
      });

      //console.log("INDEXES OF RATING CONTROLS TO REMOVE", ratingControlRemovalIndexes);

      if (ratingControlRemovalIndexes.length > 0) {
        ratingControlRemovalIndexes.forEach(removalIndex => {
          ratingControlObjectsArray.removeAt(removalIndex);
        });
      };
      
      this.rearrangeFormArray((this.loanForm.controls.ratingControlObjects as FormArray), this.currentRatingValues);
    }
    
    else if (this.currentRatingValues.length === 0) {
      (this.loanForm.controls.ratingControlObjects as FormArray).clear();
    };
    //console.log("CURRENT STATE", this.loanForm.controls);
  }

  //ADJUSTS ORDER OF FORM ARRAY ELEMENTS TO MAAINTAIN ORDER OF RATINGS
  rearrangeFormArray(formArray: FormArray, originalOrder: number[]): void {
    formArray.controls.sort((a, b) => {
      const ratingIdA = a['ratingId'];
      const ratingIdB = b['ratingId'];
      return originalOrder.indexOf(ratingIdA) - originalOrder.indexOf(ratingIdB);
    });
    //console.log("ARRANGED ARRAY CONTROLS----->>>>>", formArray);
  }

  adjustLivingBalance(livingAssistanceValue: number, ratingPriceValue: number, ratingDisbursementValue: number) {
    livingAssistanceValue = this.currentLivingAssistanceValue;
    ratingPriceValue = this.currentRatingPriceValue;
    ratingDisbursementValue = this.currentRatingDisbursementValue;

    const netTotalDisbursement = ( (ratingPriceValue - ratingDisbursementValue) - livingAssistanceValue).toString();

    this.loanForm.get('livingAssistanceTotal').setValue(netTotalDisbursement);

    //console.log("ADJUSTED LIVING ASSISTANCE BALANCE------->>>>>>>", netTotalDisbursement);
  }
  
          currentLivingAssistanceValue = 0;
          currentRatingPriceValue = 0;
          currentRatingDisbursementValue = 0;
          
  /**
   * Helper method to process triaging of form control registration.
   * @param control - represents the singular control or FormArray control element that is being subscribed to.
   */
  private subscribeToFormValues(control: FormControl) {
    const subscription: Subscription = control.valueChanges.subscribe(valueToBeFormatted => {
      if (![null, undefined].includes(valueToBeFormatted)) {
        valueToBeFormatted = valueToBeFormatted.replace(/[^\d.-]/g, '');
        //ASSIGNING GLOBAL VARIABLES WITH SUBSCRIPTION VALUES
        this.currentFormValue = valueToBeFormatted;
        this.currentControl = control;
        //console.log("CURRENT DATA!!!------->>>>>>>", [this.previousFormValue, this.currentFormValue, this.currentControl]);
    
      };
    });
    this.formSubscriptionArray.push(subscription);
    //console.log("CURRENCY SUBSCRIPTION INITIALIZED");
  }

  /**
   * Helper method to process triaging of form control registration.
   * @param formGroup - represents the form group element that is being subscribed to.
   */
  private subscribeToFormGroupValues(formGroup: FormGroup) {
    
    Object.keys(formGroup.controls).forEach(controlName => {
      if (['ratingPriceInputControl', 'ratingDisbursementInputControl'].includes(controlName)) {
        const control = formGroup.get(controlName) as FormControl;

        this.subscribeToFormValues(control);
      };
    });  
  }

  registerControlsForSubscription() {
    Object.keys(this.loanForm.controls).forEach(controlName => {
      const control = this.loanForm.get(controlName);

      if ( (control instanceof FormControl) && (['livingAssistanceTotal', 'requiredDeposit', 'totalFundsFromLender'].includes(controlName)) ) { 
        this.subscribeToFormValues(control);
      }
      else if ( (control instanceof FormArray) && controlName == 'ratingControlObjects') {
        control.controls.forEach((formGroupElement: FormGroup) => {

          this.subscribeToFormGroupValues(formGroupElement);
        });
      };  
    });
  }

  assignCurrentValue(currentControl: AbstractControl) {
    const formattedControlValue = currentControl.value;
    //console.log("CURRENT FORMATTED VALUE OF THE CONTROL IN FOCUS!!!!!------->>>>>>>", formattedControlValue);

    if (![null, undefined].includes(formattedControlValue) ) {
      this.focusControlValue = formattedControlValue.replace(/[^\d.-]/g, '');
      
    };
  }

  /**
   * Performs currency formatting using global form control and form control value global variables, which are automatically generated based upon the input field
   * that is being modified.
   * @var this.currentFormValue - represents value of current form control that is being modified.
   * @var this.currentControl - represents the current form control that is being modified.
   */
  formatAsCurrency(currentControl?: AbstractControl) {
    if (currentControl && currentControl === this.currentControl) {
      if ( (this.loanForm.get('livingAssistanceTotal').value) !== null ) {
        const unformattedLivingAssistanceTotal: string = (this.loanForm.get('livingAssistanceTotal').value).replace(/[^\d.-]/g, '');
        const numericLivingAssistanceTotal: number = Number(unformattedLivingAssistanceTotal);

        const controlName = currentControl['controlName'];
        let newTotalLivingAssistance: number = 0;
        let formattedNewTotalLivingAssistance: string = '';

        switch (controlName) {
          case 'ratingPriceInputControl':
            this.previousFormValue = this.focusControlValue;
            const numericRatingPreviousPrice: number = Number(this.previousFormValue);
            const numericRatingCurrentPrice: number = Number(this.currentFormValue);
            newTotalLivingAssistance = (numericLivingAssistanceTotal - (numericRatingCurrentPrice - numericRatingPreviousPrice) );
            break;
          case 'ratingDisbursementInputControl':
            this.previousFormValue = this.focusControlValue;
            const numericRatingPreviousDisbursement: number = Number(this.previousFormValue);
            const numericRatingCurrentDisbursement: number = Number(this.currentFormValue);
            newTotalLivingAssistance = (numericLivingAssistanceTotal + (numericRatingCurrentDisbursement - numericRatingPreviousDisbursement) );
            break;
          case 'livingAssistanceTotal':
            let numericRatingPriceTotal: number = 0;
            let numericRatingDisbursementTotal: number = 0;
            //TOTAL NET VALUE TO SUBTRACT FROM LIVING ASSISTANCE TOTAL
            let netRatingValue = 0;

            (this.loanForm.get('ratingControlObjects') as FormArray).value.forEach( (ratingValueObject: {ratingDisbursementDateControl: Date, ratingDisbursementInputControl: string, ratingPriceInputControl: string}) => {
              const unformattedRatingPriceValue: string = (ratingValueObject.ratingPriceInputControl).replace(/[^\d.-]/g, '');
              //NUMBER VALUE FOR ARRAY OF PRICES
              const numericRatingPriceValue: number = Number(unformattedRatingPriceValue);

              const unformattedRatingDisbursementValue: string = (ratingValueObject.ratingDisbursementInputControl).replace(/[^\d.-]/g, '');
              //NUMBER VALUE FOR ARRAY OF PRICES
              const numericRatingDisbursementValue: number = Number(unformattedRatingDisbursementValue);

              numericRatingPriceTotal += numericRatingPriceValue;
              numericRatingDisbursementTotal += numericRatingDisbursementValue;
            });

            netRatingValue = numericRatingPriceTotal - numericRatingDisbursementTotal;
            newTotalLivingAssistance = (numericLivingAssistanceTotal - netRatingValue);
            break;
        };

        const formattedRatingCurrentValue = this.usdFormatter.transform( (this.currentFormValue), 'USD', 'symbol', '1.2-2');
        this.currentControl.setValue(formattedRatingCurrentValue);
        
        formattedNewTotalLivingAssistance = this.usdFormatter.transform(newTotalLivingAssistance, 'USD', 'symbol', '1.2-2');
        this.loanForm.get('livingAssistanceTotal').setValue(formattedNewTotalLivingAssistance);

      }
    }
    if (this.currentFormValue !== undefined) {
      this.currentFormValue = this.usdFormatter.transform(this.currentFormValue, 'USD', 'symbol', '1.2-2');
      this.currentControl.setValue(this.currentFormValue);
      //console.log("EVENT VALUE FORMATTED!", [this.currentFormValue, this.formSubscriptionArray]);
    }
  }

   
  /**
   * Enables or disables requirement validation for stipend input fields, thereby adding and removing within the DOM as needed
   * @param boxChecked represents boolean value of box checked (true) or unchecked (false)
   */
  onStipendVerification(event: any) {
    //REPRESENTS FORM CONTROL VALUE OF CHECKBOX
    event == true ? this.checkboxChecked = true : this.checkboxChecked = false;
    this.loanForm.get('livingAssistanceIncluded').setValue(this.checkboxChecked);
    //console.log("CHECKBOX EVENT AND CHECKED VALUE----->>>>>", event, this.checkboxChecked);
    //GET INDEX IN LOAN INPUTS OF LIVING ASSISTANCE TOTAL
    const loanInputIndex = this.loanInputs.findIndex(loanInput => loanInput.name === "livingAssistanceTotal");

    //console.log("STIPEND CHECKBOX CHANGE EVENT AND INPUT", [event, this.checkboxChecked]);

    this.livingExpenseControlNames.forEach(livingExpenseControlName => {

      //ADDING AND REMOVING "REQUIRED" STATE FOR 'LIVING EXPENSE' CONTROLS
      if (this.checkboxChecked == true) {
        this.loanForm.get(livingExpenseControlName).enable();
        this.loanForm.get(livingExpenseControlName).updateValueAndValidity();

        if (livingExpenseControlName == 'livingAssistanceDates') {
          this.addLivingDisbursementDate();
        };  
          
        //console.log("LIVING ASSISTANCE TOTAL OPTIONAL VALUE", this.loanInputs[loanInputIndex].optional);
      }
      else if (this.checkboxChecked == false) {
        if (livingExpenseControlName == 'livingAssistanceDates') {
          (this.loanForm.get(livingExpenseControlName) as FormArray).clear();
        }

        this.loanForm.get(livingExpenseControlName).disable();
    
        //console.log("UPDATED OPTIONAL STIPEND INPUT", this.loanInputs[loanInputIndex]);
      } 
    });
    //console.log("STATUS OF LIVING COST CONTROLS AFTER STIPEND METHOD----->>>>>", this.loanForm)
  }

  /**
   * Remove one or more form controls from a specified 'UntypedFormGroup'
   * @param form 
   * @param controlNames 
  */
  removeControls(form: UntypedFormGroup, controlNames: string[]) {
    controlNames.forEach(controlName => {
      form.removeControl(controlName);
    });
    //console.log("FORM CONTROL REMOVED??!!---->>>>", controlNames);
  }
  
  /**
   * Clears loan form of previous values and resets it to its default state. 
   */
  initializeNewApplication() {
    const ratingControlObjectsArray = (this.loanForm.controls.ratingControlObjects as FormArray);

   //console.log("RESETTING FORM TO NEW FORM");
    //RESET NON-FORM ARRAY FORM CONTROLS
    this.loanForm.reset();
    
    ratingControlObjectsArray.clear();
    //console.log("CLEARED RATING CONTROL OBJECTS ARRAY", ratingControlObjectsArray);

    this.onStipendVerification(false);
  }

  currentLoanApplication: LoanApplication = new LoanApplication();
  currentLoanRatingObjects: QuotedRating[] = [];
  currentLoanId: number = undefined;
  populatingExistingLoan = false;

  populateGeneralFormData(index: number) {
    this.initializeNewApplication();

    //console.log("POPULATE FORM REQUEST ACTIVATED!!");
    let ratingControlObjects = (this.loanForm.controls.ratingControlObjects as FormArray);
    
    //REPRESENTS INDEXED LOAN APPLICATION RESPONSE
    let selectedLoanApplication: any;
    //RESPRESENTS INDEXED LOAN RATINGS VALUES RESPONSE
    let selectedLoanRatings: any;
    //INITIALIZING LOAN OBJECT ARRAY TO ORGANIZE QUOTED RATING OBJECTS
    let loanRatingObjectArray: QuotedRating[] = [];

    //PROPERTIES FOR ADJUSTING DATES FROM SERVER, PRIOR TO SETTING FORM VALUE
    let dateMinutes: number;
    let adjustedDate: Date;

    this.currentLoanIndex = index;

    selectedLoanApplication = this.existingLoanApplications[this.currentLoanIndex];
   
    //console.log("SELECTED LOAN APPLICATION", selectedLoanApplication);
    //console.log("SELECTED LOAN RATING", selectedLoanRatings);

    //CONSTRUCTING LOAN APPLICATION BASED UPON CURRENT SELECTED INDEX
    this.currentLoanApplication.id = selectedLoanApplication.id,
    this.currentLoanApplication.userId = selectedLoanApplication.user_id,
    this.currentLoanApplication.leadId = selectedLoanApplication.lead_id,
    this.currentLoanApplication.lenderName = selectedLoanApplication.lender_name,
    this.currentLoanApplication.totalFundsFromLender = Number(selectedLoanApplication.total_funds_from_lender),
    this.currentLoanApplication.requiredDeposit = Number(selectedLoanApplication.required_deposit),
    this.currentLoanApplication.loanTerm = selectedLoanApplication.loan_term,
    this.currentLoanApplication.termStartDate = selectedLoanApplication.term_start_date,
    this.currentLoanApplication.termEndDate = selectedLoanApplication.term_end_date,
    this.currentLoanApplication.relevantRatings = JSON.parse(selectedLoanApplication.relevant_ratings),
    this.currentLoanApplication.disbursementDate = selectedLoanApplication.disbursement_date,
    this.currentLoanApplication.loanNotes = selectedLoanApplication.loan_notes;

    this.currentLoanApplication.livingAssistanceIncluded = selectedLoanApplication.living_assistance_included == 1 ? true : false;
    if (this.currentLoanApplication.livingAssistanceIncluded == true) {
      this.currentLoanApplication.livingAssistanceTotal = Number(selectedLoanApplication.living_assistance_total);
      this.currentLoanApplication.livingAssistanceDates = JSON.parse(selectedLoanApplication.living_assistance_dates);
    };
    
    
    //console.log("CURRENT LOAN APPLICATION OBJECT", this.currentLoanApplication);

    selectedLoanApplication.loanRatings.forEach(loanRating => {
      const loanRatingObject: QuotedRating = new QuotedRating();
      
      loanRatingObject.id = loanRating.id,
      loanRatingObject.loanId = loanRating.loan_id,
      loanRatingObject.ratingDisbursement = Number(loanRating.rating_disbursement),
      loanRatingObject.ratingDisbursementDate = loanRating.rating_disbursement_date,
      loanRatingObject.ratingPrice = Number(loanRating.rating_price);

      loanRatingObjectArray.push(loanRatingObject);
    });

    //UPDATING GLOBAL QUOTED RATING OBJECTS ARRAY FOR CURRENT LOAN APPLICATION
    this.currentLoanRatingObjects = loanRatingObjectArray;

    this.currentLoanId = this.currentLoanApplication.id;

    const existingLoanFormBuilder: FormBuilder = new FormBuilder();

    //LOCAL VALIDATION ARRAY
    const validations = [];
    validations.push(Validators.required);

    //console.log("CURRENT QUOTED RATINGS OBJECT ARRAY", this.currentLoanRatingObjects);

    //SET LOAN FORM VALUES
    for (const [key] of Object.entries(this.loanForm.controls)) {

      switch(key) {
        case "relevantRatings":
          this.loanForm.get(key).setValue(this.currentLoanApplication.relevantRatings);

          this.processRatingOptions(this.currentLoanApplication.relevantRatings);

          const ratingControlsArray = (this.loanForm.get('ratingControlObjects') as FormArray).controls;

          ratingControlsArray.forEach((ratingControl, index) => {
            const currentLoanRatingObject = this.currentLoanRatingObjects[index];
            const formattedRatingPrice = this.usdFormatter.transform(currentLoanRatingObject.ratingPrice, 'USD', 'symbol', '1.2-2');
            const formattedRatingDisbursement = this.usdFormatter.transform(currentLoanRatingObject.ratingDisbursement, 'USD', 'symbol', '1.2-2');

            const ratingDisbursementDate = new Date(currentLoanRatingObject.ratingDisbursementDate);
          
            dateMinutes = ratingDisbursementDate.setMinutes(ratingDisbursementDate.getMinutes() + ratingDisbursementDate.getTimezoneOffset());
            adjustedDate = new Date(dateMinutes);

            ratingControl.get('ratingPriceInputControl').setValue(formattedRatingPrice);
            ratingControl.get('ratingDisbursementInputControl').setValue(formattedRatingDisbursement);
            ratingControl.get('ratingDisbursementDateControl').setValue(adjustedDate);
          });
          //console.log("FILLED RATING DATA", ratingControlsArray);
          break;
        case "lenderName":
          this.loanForm.get(key).setValue(this.currentLoanApplication.lenderName);
          break;
        case "totalFundsFromLender":
          this.loanForm.get(key).setValue(this.usdFormatter.transform(this.currentLoanApplication.totalFundsFromLender, 'USD', 'symbol', '1.2-2'));
          break;
        case "requiredDeposit":
          this.loanForm.get(key).setValue(this.usdFormatter.transform(this.currentLoanApplication.requiredDeposit, 'USD', 'symbol', '1.2-2'));
          break;
        case "loanTerm":
          this.loanForm.get(key).setValue(this.currentLoanApplication.loanTerm);
          break;
        case "termStartDate":
          const startDateObject = new Date(this.currentLoanApplication.termStartDate);

          dateMinutes = startDateObject.setMinutes(startDateObject.getMinutes() + startDateObject.getTimezoneOffset());
          adjustedDate = new Date(dateMinutes);
          this.loanForm.get(key).setValue(adjustedDate);
          break;
        case "termEndDate": 
          const endDateObject = new Date(this.currentLoanApplication.termEndDate);
          
          dateMinutes = endDateObject.setMinutes(endDateObject.getMinutes() + endDateObject.getTimezoneOffset());
          adjustedDate = new Date(dateMinutes);
          this.loanForm.get(key).setValue(adjustedDate);
          break;
        case "disbursementDate":       
          const disbursementDateObject = new Date(this.currentLoanApplication.disbursementDate);
          
          dateMinutes = disbursementDateObject.setMinutes(disbursementDateObject.getMinutes() + disbursementDateObject.getTimezoneOffset());
          adjustedDate = new Date(dateMinutes);
          this.loanForm.get(key).setValue(adjustedDate);
          break;
        case "livingAssistanceIncluded":
          if (this.currentLoanApplication.livingAssistanceIncluded == false) {
            this.onStipendVerification(this.currentLoanApplication.livingAssistanceIncluded);
            //console.log("LIVING ASSISTANCE FORM CONTROL VALUE", this.loanForm.get(key).value);
          }
          //IF STIPEND DATA EXISTS FOR CURRENT LOAN APPLICATION, THE ARRAY OF LIVING ASSISTANCE DATES GENERATE THE NECESSARY DATE CONTROLS AND FILL THEM 
          else if (this.currentLoanApplication.livingAssistanceIncluded == true) {
            const livingAssistanceDateFormArray = (this.loanForm.get('livingAssistanceDates') as FormArray);
            const livingAssistanceTotal = this.usdFormatter.transform(this.currentLoanApplication.livingAssistanceTotal, 'USD', 'symbol', '1.2-2');
            const currentLivingAssistanceDateCount = this.currentLoanApplication.livingAssistanceDates.length;
            
            livingAssistanceDateFormArray.clear();

            this.onStipendVerification(this.currentLoanApplication.livingAssistanceIncluded);

            this.loanForm.get('livingAssistanceTotal').setValue(livingAssistanceTotal);
            
            //console.log("LIVING ASSISTANCE FORM CONTROL VALUE", this.loanForm.get(key).value);

            this.currentLoanApplication.livingAssistanceDates.forEach((livingAssistanceDate, index) => {
              const livingAssistanceDateObject = new Date(livingAssistanceDate); 

              dateMinutes = livingAssistanceDateObject.setMinutes(livingAssistanceDateObject.getMinutes() + livingAssistanceDateObject.getTimezoneOffset());
              adjustedDate = new Date(dateMinutes);


              livingAssistanceDateFormArray.controls[index].setValue(adjustedDate);

              //ONLY ADD ADDITIONAL LIVING ASSISTANCE DATE IF THE MAXIMUM INDEX POSITION IS NOT REACHED
              if (index < (currentLivingAssistanceDateCount - 1)) {
                this.addLivingDisbursementDate();
              }
               
            });
            //console.log("LIVING ASSISTANCE DATES ADDED----->>>>>", livingAssistanceDateFormArray);
          };
          break;
        case "loanNotes":
          this.loanForm.get(key).setValue(this.currentLoanApplication.loanNotes);
          break;
      };
    };
  }



  /*addLoanNote() {
    //let noteToSave: savedLoanNote;

    this.pendingNoteToSave.noteText = this.loanForm.get("loanNotes").value;
    console.log("UPDATED TEXT VALUE??", this.loanForm.get("loanNotes").value);

    this.loanDataSubscription = this._usersService.addLoanNote(this.pendingNoteToSave).subscribe(response => {
      console.log("RESPONSE FROM SAVED LOAN NOTE HERE!!", response);
      this.savedNotesArray.push(this.pendingNoteToSave);
      this._snackbar.show('Note Added!', 'close', 'success');
    }, (err) => {
			this._snackbar.errorHandler('addLoanNote', err);
		});
  }*/


  /**
   * Used to intialize and submit loan application/quoted rating data
   * @param loanApplication represents loan application object for submission
   * @param quotedRatings represents array of quotedRating objects for submission
  */
  submitLoanForm(loanId? :number) {
    //event.preventDefault();
    let updatingLoanForm = false;
    this.loanApplication = new LoanApplication();
    this.quotedRatings = [];
    //Constructing dynamic quoted rating object for submission
    //let quotedRating: QuotedRating = new QuotedRating();
    let unformattedControlValue = "";

    if (this.applicant)
    {
      this.loanApplication.userId = this.applicant.id;
    }

    for (const [key] of Object.entries(this.loanForm.controls)) {
      switch(key) {
        case "lenderName":
          this.loanApplication.lenderName = this.loanForm.get(key).value;
          break;
        case "totalFundsFromLender":
          unformattedControlValue = (this.loanForm.get(key).value).replace(/[^0-9.-]/g, '');
          this.loanApplication.totalFundsFromLender = Number(unformattedControlValue);
          break;
        case "requiredDeposit":
          unformattedControlValue = (this.loanForm.get(key).value).replace(/[^0-9.-]/g, '');
          this.loanApplication.requiredDeposit = Number(unformattedControlValue);
          break;
        case "loanTerm":
          this.loanApplication.loanTerm = Number(this.loanForm.get(key).value);
          break;
        case "termStartDate":
          const loanStartDate: Date = this.loanForm.get(key).value;
          this.loanApplication.termStartDate = loanStartDate;
          break;
        case "termEndDate":
          const loanEndDate: Date = this.loanForm.get(key).value;
          this.loanApplication.termEndDate = loanEndDate;
          break;
        case "relevantRatings":
          this.loanApplication.relevantRatings = this.loanForm.get(key).value;
          break;
        case "disbursementDate":
          const disbursementDate: Date = this.loanForm.get(key).value;
          this.loanApplication.disbursementDate = disbursementDate;
          break;
        case "livingAssistanceIncluded":
          this.loanApplication.livingAssistanceIncluded = this.loanForm.get(key).value;
          break;
        case "livingAssistanceTotal":
          if (!this.loanForm.get(key).disabled) {
            unformattedControlValue = (this.loanForm.get(key).value).replace(/[^0-9.-]/g, '');
            this.loanApplication.livingAssistanceTotal = Number(unformattedControlValue);
          };
          break;
        case "livingAssistanceDates":
          if (!this.loanForm.get(key).disabled) {
            const livingAssistanceDates = (this.loanForm.get(key) as FormArray);

            if (livingAssistanceDates.length > 0) {
              this.loanApplication.livingAssistanceDates = livingAssistanceDates.value;
              //console.log("VALUE OF LOAN APPLICATION LIVING ASSISTANCE DATES!!----->>>>>", livingAssistanceDates.value);
            }
          };
          break;
        case "loanNotes":
          this.loanApplication.loanNotes = this.loanForm.get(key).value;
          break;
      };
    }

    const ratingControlObjectsArray = (this.loanForm.get('ratingControlObjects') as FormArray).controls;
      
      ratingControlObjectsArray.forEach( (ratingControlObject: FormGroup) => {
        const quotedRating: QuotedRating = new QuotedRating();

        const ratingPrice = ratingControlObject.get('ratingPriceInputControl').value;
        const ratingDisbursement = ratingControlObject.get('ratingDisbursementInputControl').value;
        const ratingDisbursementDate = ratingControlObject.get('ratingDisbursementDateControl').value;

        quotedRating.ratingPrice = Number(ratingPrice.replace(/[^0-9.-]/g, ''));
        quotedRating.ratingDisbursement = Number(ratingDisbursement.replace(/[^0-9.-]/g, ''));
        quotedRating.ratingDisbursementDate = ratingDisbursementDate;

        this.quotedRatings.push(quotedRating);
      });
      //console.log("LOAN APPLICATION AND RATINGS TO UPDATE", [this.loanApplication, this.quotedRatings]);


    if (loanId) {
      //console.log("LOAN ID BLOCK TRIGGERED");
      //console.log("SELECTED RATING VALUES SHOWN HERE", this.currentRatingValues);
      let index = 0;
      this.gettingLoanData = true;

      //ASSIGNING ID VALUES TO LOAN APPLICATION MODEL FOR CURRENT LOAN APPLICATION UPDATE
      this.loanApplication.id = loanId;
      this.loanApplication.leadId = this.currentLoanApplication.leadId;

      this.loanDataSubscription = this._usersService.updateLoanApplication(this.loanApplication, this.quotedRatings).subscribe(response => {

        //console.log("UPDATED RESPONSE!", response);
        this._snackbar.show('Loan Application Updated!', 'close', 'success');
        this.getExistingLoanData(this.applicant.id);

        if (this.gettingLoanData == false) {
          this.populateGeneralFormData(this.currentLoanIndex);
        }
        
      }, (err) => {
        this._snackbar.errorHandler('updatedLoanForm', err);
      });
    }
    else {
      //console.log("CURRENT RATINGS VALUES", this.currentRatingValues);

      this.loanDataSubscription = this._usersService.addLoanApplication(this.loanApplication, this.quotedRatings).subscribe(response => {
        
        //console.log("SAVED RESPONSE!", response);
        this.initializeNewApplication();
        this._snackbar.show('Loan Application Added!', 'close', 'success');
        this.getExistingLoanData(this.applicant.id);
      }, (err) => {
        this._snackbar.errorHandler('submitLoanForm', err);
      });
  
    }
  }
}
