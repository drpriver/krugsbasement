#
# Copyright © 2021-2022, David Priver
#

from flask_wtf import FlaskForm
from wtforms import StringField, PasswordField, BooleanField, SubmitField
from wtforms.validators import DataRequired, EqualTo, ValidationError, InputRequired, Length, Email

class LoginForm(FlaskForm):
    username = StringField('Username', validators=[DataRequired()])
    password = PasswordField('Password', validators=[DataRequired()])
    remember_me = BooleanField('Remember Me', default='checked')
    login = SubmitField('Sign In')
    def dictify(self) -> dict:
        return dict(
            hidden = self.hidden_tag(),
            password = dict(errors=self.password.errors),
            remember_me = dict(errors=self.remember_me.errors),
            submit = self.login(),
            username=dict(errors=self.username.errors),
        )

class RegisterForm(FlaskForm):
    username = StringField('Username', validators=[DataRequired(), Length(min=5, max=32)])
    email = StringField('Email', validators=[DataRequired(), Email()])
    password = PasswordField('Password', validators=[DataRequired(), Length(min=8)])
    password2 = PasswordField('Repeat Password', validators=[DataRequired(), EqualTo('password')])
    magic = StringField('Magic Code', validators=[DataRequired()])
    remember_me = BooleanField('Remember Me', default='checked')
    register = SubmitField('Register')
    def dictify(self) -> dict:
        return dict(
            hidden = self.hidden_tag(),
            username = dict(errors=self.username.errors),
            email    = dict(errors=self.email.errors),
            password = dict(errors=self.password.errors),
            password2 = dict(errors=self.password2.errors),
            remember_me = dict(errors=self.remember_me.errors),
            submit = self.register(),
        )

class CampaignForm(FlaskForm):
    campaignname = StringField('Name', validators=[DataRequired(), Length(min=1, max=128)])
    submit = SubmitField('Create')
    def dictify(self) -> dict:
        return dict(
                hidden = self.hidden_tag(),
                campaignname = dict(errors=self.campaignname.errors),
                submit = self.submit(),
                )
