from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('patients', '0003_patient_ai_summary'),
    ]

    operations = [
        migrations.AlterField(
            model_name='medicalrecord',
            name='description',
            field=models.TextField(blank=True),
        ),
    ]