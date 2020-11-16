"""Module psiturk_config."""
from __future__ import print_function
from future import standard_library
from distutils import file_util
import os
from configparser import ConfigParser
from dotenv import load_dotenv, find_dotenv
from .psiturk_exceptions import EphemeralContainerDBError, PsiturkException
standard_library.install_aliases()


class PsiturkConfig(ConfigParser):
    """PsiturkConfig class."""

    def __init__(self, localConfig="config.txt",
                 globalConfigName=".psiturkconfig", **kwargs):
        """Init."""
        load_dotenv(find_dotenv(usecwd=True))
        if 'PSITURK_GLOBAL_CONFIG_LOCATION' in os.environ:
            globalConfig = os.path.join(
                os.environ['PSITURK_GLOBAL_CONFIG_LOCATION'], globalConfigName)
        else:  # if nothing is set default to user's home directory
            globalConfig = "~/" + globalConfigName
        self.parent = ConfigParser
        self.parent.__init__(self, **kwargs)
        self.localFile = localConfig
        self.globalFile = os.path.expanduser(globalConfig)

    def load_config(self):
        """Load config."""
        defaults_folder = os.path.join(
            os.path.dirname(__file__), "default_configs")
        local_defaults_file = os.path.join(
            defaults_folder, "local_config_defaults.txt")
        global_defaults_file = os.path.join(
            defaults_folder, "global_config_defaults.txt")

        # Read files in this order, with later settings overriding
        # earlier ones:
        #
        # * global default
        # * local default
        # * user's global file
        # * user's local's file
        # * env vars
        self.read([global_defaults_file, local_defaults_file,
                   self.globalFile, self.localFile])
        # prefer environment
        these_as_they_are = ['PORT', 'DATABASE_URL']  # heroku sets these
        for section in self.sections():
            for config_var in self[section]:
                config_var_upper = config_var.upper()
                config_val_env_override = None

                if config_var_upper in these_as_they_are:
                    config_val_env_override = os.environ.get(config_var_upper)

                # prefer any `PSITURK_` key over `these_as_they_are` variants
                psiturk_key = f'PSITURK_{config_var_upper}'
                if psiturk_key in os.environ:
                    config_val_env_override = os.environ.get(psiturk_key)

                if config_val_env_override:
                    self.set(section, config_var, config_val_env_override)

        # heroku files are ephemeral.
        # Error if we're trying to use a file as the db
        if 'ON_CLOUD' in os.environ:
            database_url = self.get('Database Parameters',
                                    'database_url')
            if ('localhost' in database_url) or ('sqlite' in database_url):
                raise EphemeralContainerDBError(database_url)

    def get_ad_url(self):
        """Get ad url."""
        if self.has_option('HIT Configuration', 'ad_url'):
            return self.get('HIT Configuration', 'ad_url')
        else:
            need_these = ['ad_url_domain', 'ad_url_protocol', 'ad_url_port',
                          'ad_url_route']
            for need_this in need_these:
                if not self.get('HIT Configuration', need_this):
                    raise PsiturkException(
                        message=f'missing ad_url config var `{need_this}`')
            ad_url_domain = self.get('HIT Configuration', 'ad_url_domain')
            ad_url_protocol = self.get('HIT Configuration', 'ad_url_protocol')
            ad_url_port = self.get('HIT Configuration', 'ad_url_port')
            ad_url_route = self.get('HIT Configuration', 'ad_url_route')
            return f"{ad_url_protocol}://{ad_url_domain}:{ad_url_port}:{ad_url_route}"
