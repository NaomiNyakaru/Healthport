from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('patients', '0002_recordattachment'),
    ]

    operations = [
        migrations.AddField(
            model_name='patientprofile',
            name='ai_summary',
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name='patientprofile',
            name='ai_summary_generated',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='patientprofile',
            name='ai_summary_hash',
            field=models.CharField(blank=True, max_length=64),
        ),
    ]