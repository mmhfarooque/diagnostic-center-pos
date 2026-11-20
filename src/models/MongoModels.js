let modelsCache = null;

export async function getMongoModels() {
  if (modelsCache) return modelsCache;
  const mod = await import('mongoose');
  const mongoose = mod.default || mod;

  const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    role: { type: String, enum: ['admin', 'operator', 'lab_tech'], default: 'operator' },
    pin_code: { type: String, required: true },
    password_hash: { type: String, required: true },
    is_active: { type: Boolean, default: true }
  }, { timestamps: true });

  const patientSchema = new mongoose.Schema({
    patient_uid: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    age: { type: Number, required: true },
    age_unit: { type: String, default: 'Y' },
    gender: { type: String, enum: ['MALE', 'FEMALE', 'OTHER'], default: 'MALE' },
    phone: { type: String, required: true, index: true },
    address: { type: String, default: '' }
  }, { timestamps: true });

  const doctorSchema = new mongoose.Schema({
    name: { type: String, required: true },
    degrees: { type: String, default: '' },
    designation: { type: String, default: '' },
    phone: { type: String, default: '' },
    commission_percent: { type: Number, default: 0 },
    is_active: { type: Boolean, default: true }
  }, { timestamps: true });

  const testSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    department_name: { type: String, required: true },
    price: { type: Number, required: true },
    specimen: { type: String, default: 'None' },
    sample_tube: { type: String, default: '' },
    room_no: { type: String, default: '' },
    delivery_hours: { type: Number, default: 2 },
    is_active: { type: Boolean, default: true }
  }, { timestamps: true });

  const packageSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    package_price: { type: Number, required: true },
    regular_price: { type: Number, required: true },
    tests: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Test' }],
    is_active: { type: Boolean, default: true }
  }, { timestamps: true });

  const invoiceSchema = new mongoose.Schema({
    invoice_no: { type: String, required: true, unique: true, index: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
    patient_name: String,
    patient_phone: String,
    patient_uid: String,
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' },
    doctor_name: String,
    operator_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    operator_name: String,
    subtotal: { type: Number, required: true },
    discount_type: { type: String, default: 'NONE' },
    discount_value: { type: Number, default: 0 },
    discount_amount: { type: Number, default: 0 },
    discount_remark: String,
    urgent_surcharge: { type: Number, default: 0 },
    net_amount: { type: Number, required: true },
    paid_amount: { type: Number, required: true },
    due_amount: { type: Number, required: true },
    payment_method: { type: String, default: 'CASH' },
    payment_reference: String,
    status: {
      type: String,
      enum: ['SAMPLE_PENDING', 'SAMPLE_COLLECTED', 'IN_TESTING', 'READY', 'DELIVERED', 'CANCELLED'],
      default: 'SAMPLE_PENDING'
    },
    delivery_date: String,
    notes: String,
    items: [
      {
        test_code: String,
        test_name: String,
        department_name: String,
        price: Number,
        room_no: String,
        specimen: String,
        delivery_time: String,
        results: [
          {
            parameter_name: String,
            result_value: String,
            unit: String,
            reference_range: String,
            flag: String
          }
        ]
      }
    ],
    payments: [
      {
        amount: Number,
        payment_method: String,
        payment_reference: String,
        payment_type: String,
        created_at: { type: Date, default: Date.now }
      }
    ]
  }, { timestamps: true });

  const settingSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    value: { type: String, required: true }
  }, { timestamps: true });

  modelsCache = {
    User: mongoose.models.User || mongoose.model('User', userSchema),
    Patient: mongoose.models.Patient || mongoose.model('Patient', patientSchema),
    Doctor: mongoose.models.Doctor || mongoose.model('Doctor', doctorSchema),
    Test: mongoose.models.Test || mongoose.model('Test', testSchema),
    Package: mongoose.models.Package || mongoose.model('Package', packageSchema),
    Invoice: mongoose.models.Invoice || mongoose.model('Invoice', invoiceSchema),
    Setting: mongoose.models.Setting || mongoose.model('Setting', settingSchema)
  };

  return modelsCache;
}
