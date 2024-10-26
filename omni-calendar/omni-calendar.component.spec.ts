import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OmniCalendarComponent } from './omni-calendar.component';

describe('OmniCalendarComponent', () => {
  let component: OmniCalendarComponent;
  let fixture: ComponentFixture<OmniCalendarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ OmniCalendarComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(OmniCalendarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
