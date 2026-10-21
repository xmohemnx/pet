'use client';
import type { Pet, PetInput } from '@petra/contracts';
import { api } from '../lib/auth-client';
import { CareForm } from './care-shared';
export function PetForm({
  pet,
  onSaved,
}: {
  pet?: Pet;
  onSaved: (id: string) => void;
}) {
  return (
    <CareForm
      label={pet ? 'حفظ ملف الحيوان' : 'إضافة الحيوان'}
      submit={async (f) => {
        const input: PetInput = {
          name: String(f.get('name')),
          species: String(f.get('species')) as PetInput['species'],
          breed: String(f.get('breed')),
          sex: String(f.get('sex')) as PetInput['sex'],
          birthDate: String(f.get('birthDate')) || null,
          birthEstimated: f.get('birthEstimated') === 'on',
          weightGrams: f.get('weight')
            ? Math.round(Number(f.get('weight')) * 1000)
            : null,
          neutered: f.get('neutered') === 'on',
          color: String(f.get('color')),
          microchip: String(f.get('microchip')),
          allergies: String(f.get('allergies')),
          chronicConditions: String(f.get('chronicConditions')),
          emergencyContact: String(f.get('emergencyContact')),
        };
        const r = await api<{ id: string }>(pet ? `pets/${pet.id}` : 'pets', {
          method: pet ? 'PATCH' : 'POST',
          body: JSON.stringify(
            pet ? { pet: input, version: pet.version } : input,
          ),
        });
        onSaved(r.id);
      }}
    >
      <div className="care-fields">
        <label>
          اسم الحيوان
          <input
            name="name"
            required
            maxLength={100}
            defaultValue={pet?.name}
          />
        </label>
        <label>
          النوع
          <select name="species" defaultValue={pet?.species ?? 'cat'}>
            <option value="cat">قط</option>
            <option value="dog">كلب</option>
            <option value="bird">طائر</option>
            <option value="rabbit">أرنب</option>
            <option value="other">آخر</option>
          </select>
        </label>
        <label>
          السلالة
          <input name="breed" maxLength={100} defaultValue={pet?.breed} />
        </label>
        <label>
          الجنس
          <select name="sex" defaultValue={pet?.sex ?? 'unknown'}>
            <option value="unknown">غير محدد</option>
            <option value="female">أنثى</option>
            <option value="male">ذكر</option>
          </select>
        </label>
        <label>
          تاريخ الميلاد
          <input
            type="date"
            name="birthDate"
            defaultValue={pet?.birth_date?.slice(0, 10)}
          />
        </label>
        <label>
          الوزن (كغم)
          <input
            type="number"
            name="weight"
            min="0.001"
            max="1000"
            step="0.001"
            defaultValue={
              pet?.weight_grams ? pet.weight_grams / 1000 : undefined
            }
          />
        </label>
        <label>
          اللون
          <input name="color" maxLength={100} defaultValue={pet?.color} />
        </label>
        <label>
          رقم الشريحة
          <input
            name="microchip"
            maxLength={100}
            defaultValue={pet?.microchip}
          />
        </label>
      </div>
      <div className="care-checks">
        <label>
          <input
            type="checkbox"
            name="birthEstimated"
            defaultChecked={pet?.birth_estimated}
          />
          تاريخ الميلاد تقديري
        </label>
        <label>
          <input
            type="checkbox"
            name="neutered"
            defaultChecked={pet?.neutered}
          />
          معقم
        </label>
      </div>
      <label>
        الحساسية المعروفة
        <textarea
          name="allergies"
          maxLength={3000}
          defaultValue={pet?.allergies}
        />
      </label>
      <label>
        الحالات المزمنة الموثقة
        <textarea
          name="chronicConditions"
          maxLength={3000}
          defaultValue={pet?.chronic_conditions}
        />
      </label>
      <label>
        جهة اتصال للطوارئ (خاصة)
        <input
          name="emergencyContact"
          maxLength={300}
          defaultValue={pet?.emergency_contact}
        />
      </label>
    </CareForm>
  );
}
